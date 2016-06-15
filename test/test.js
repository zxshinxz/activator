/*jslint node:true, nomen:true, debug:true */
/*jshint unused:vars */
/*global describe, before, beforeEach, it */

var request = require('supertest'), should = require('should'), express = require('express'), bodyParser = require('body-parser'),
app = express(), _ = require('lodash'), async = require('async'), smtp = require('smtp-tester'),
r = request(app), mail, fs = require('fs'),
activator = require('../lib/activator'), templates = __dirname+'/resources',
mailer = require('nodemailer'),
USERS = {
	"1": {id:"1",email:"me@you.com",password:"1234"}
}, lang,
users,
quote = function (regex) {
	/*jslint regexp:true */
  var ret = regex.replace(/([()[{*+.$^\\/\\|?])/g, '\\$1');
	/*jslint regexp:false */
	return(ret);
},
bodyMatcher = function (body,matcher) {
	/*jslint regexp:true */
	var ret = body.replace(/[\r\n]+/g,'').match(new RegExp(quote(matcher.replace(/[\r\n]+/g,'')).replace(/<%=[^%]+%>/g,'.*')));
	/*jslint regexp:false */
	return(ret);
},
userModel = {
	_find: function (login,cb) {
		var found = null;
		if (!login) {
			cb("nologin");
		} else if (users[login]) {
			cb(null,_.cloneDeep(users[login]));
		} else {
			_.each(users,function (val) {
				if (val && val.email === login) {
					found = val;
					return(false);
				}
			});
			cb(null,_.cloneDeep(found));
		}
	},
	find: function() {
		this._find.apply(this,arguments);
	},
	save: function (id,model,cb) {
		if (id && users[id]) {
			_.extend(users[id],model);
			cb(null);
		} else {
			cb(404);
		}
	}
}, 
reset = function () {
	users = _.cloneDeep(USERS);
	if (mail && mail.removeAll) {
		mail.removeAll();
	}
},
userModelEmail = _.extend({},userModel,{find: function (login,cb) {
	this._find(login,function (err,res) {
		if (res && res.email) {
			res.funny = res.email;
			delete res.email;
		}
		cb(err,res);
	});
	}
}),
MAILPORT = 30111,
url = "smtp://localhost:"+MAILPORT+"/activator.net",
maileropts = { host: "localhost", port:MAILPORT, name: "activator.net", secureConnection: false },
from = "test@activator.net",
createUser = function (req,res,next) {
	users["2"] = {id:"2",email:"you@foo.com",password:"5678"};
	req.activator = {id:"2",body:"2"};
	next();
},
splitTemplate = function (path) {
	/*jslint stupid:true */
	var content = fs.readFileSync(path,'utf8');
	/*jslint stupid:false */
	content = content.match(/^([^\n]*)\n[^\n]*\n((.|\n)*)/m);
	return(content);
},
genHandler = function(email,path,data,cb) {
	return function(rcpt,msgid,content) {
		var url, ret, re = new RegExp('http:\\/\\/\\S*'+path.replace(/\//g,'\\/')+'\\?code=([^\\s\\&]+)\\&email=(\\S+)\\&user=([^\\s\\&]+)'),
			subject = data.subject;
		rcpt.should.eql(email);
		// check for the correct Subject in the email
		should.exist(content.data);
		content.headers.subject.should.eql(subject);
		// do we have actual content to test? if so, we should ignore templates, because we do not have the request stuff
		if (data.text) {
			should.exist(content.text);
			should.exist(bodyMatcher(content.text,data.text));
			url = content.text.match(re);
			should.exist(url);
			// check that code and email match what is in database
			url.length.should.eql(4);
			ret = _.object(["path","code","email","user"],url);
			ret.email.should.eql(email);
		}
		if (data.html) {
			should.exist(content.html);
			should.exist(bodyMatcher(content.html,data.html));
			url = content.html.match(re);
			should.exist(url);
			// check that code and email match what is in database
			url.length.should.eql(4);
			ret = _.object(["path","code","email","user"],url);
			ret.email.should.eql(email);
		}
		if (!ret) {
			url = (content.text||content.html).match(re);
			should.exist(url);
			// check that code and email match what is in database
			url.length.should.eql(4);
			ret = _.object(["path","code","email","user"],url);
			ret.email.should.eql(email);
		}
		cb(null,ret);
	};
},
aHandler = function (email,data,cb) {
	if (!cb) {
		cb = data;
		data = {};
	}
	// set up the default subject
	data.subject = data.subject || "Activate Email";
	return genHandler(email,"/activate/my/account",data,cb);
},
rHandler = function(email,data,cb) {
	if (!cb) {
		cb = data;
		data = {};
	}
	// set up the default subject
	data.subject = data.subject || "Password Reset Email";
	return genHandler(email,"/reset/my/password",data,cb);
},
createActivateHandler = function (req,res,next) {
	// the header is not normally set, so we know we incurred the handler
	res.set("activator","createActivateHandler");
	res.status(req.activator.code).send(req.activator.message);
},
completeActivateHandler = function (req,res,next) {
	// the header is not normally set, so we know we incurred the handler
	res.set("activator","completeActivateHandler");
	res.status(req.activator.code).send(req.activator.message);
},
createResetHandler = function (req,res,next) {
	var msg = req.activator.message;
	// the header is not normally set, so we know we incurred the handler
	res.set("activator","createResetHandler");
	if (msg === null || msg === undefined || typeof(msg) === "number") {
		res.sendStatus(req.activator.code);
	} else {
		res.status(req.activator.code).send(req.activator.message);
	}
},
completeResetHandler = function (req,res,next) {
	// the header is not normally set, so we know we incurred the handler
	res.set("activator","completeResetHandler");
	res.status(req.activator.code).send(req.activator.message);
}, 
setLang = function (req,res,next) {
	if (lang) {
		req.lang = lang;
	}
	next();
},
allTests;


before(function(){
  debugger;
});

before(function(){
  reset();
});

allTests = function () {
	beforeEach(reset);
  describe('activate', function(){
		it('should send 500 for user property not added', function(done){
			r.post('/usersbad').expect(500,done);
		});
		it('should fail for known user but bad code', function(done){
			var email, handler;
			async.waterfall([
				function (cb) {r.post('/users').expect(201,"2",cb);},
				function (res,cb) {
					email = users["2"].email;
					handler = aHandler(email,cb);
					mail.bind(email,handler);
				},
				function (res,cb) {
					mail.unbind(email,handler);
					r.put('/users/'+res.user+'/activate').type("json").send({code:"asasqsqsqs"}).expect(400,'invalidcode',cb);
				}
			],done);
		});
		it('should fail for known user but bad code with handler', function(done){
			var email, handler;
			async.waterfall([
				function (cb) {r.post('/usersnext').expect('activator','createActivateHandler').expect(201,cb);},
				function (res,cb) {
					email = users["2"].email;
					handler = aHandler(email,cb);
					mail.bind(email,handler);
				},
				function (res,cb) {
					mail.unbind(email,handler);
					r.put('/usersnext/'+res.user+'/activate').type("json").send({code:"asasqsqsqs"}).expect('activator','completeActivateHandler').expect(400,cb);
				}
			],done);
		});
		it('should succeed for known user', function(done){
			var email, handler;
			async.waterfall([
				function (cb) {r.post('/users').expect(201,cb);},
				function (res,cb) {
					res.text.should.equal("2");
					email = users["2"].email;
					handler = aHandler(email,cb);
					mail.bind(email,handler);
				},
				function (res,cb) {
					mail.unbind(email,handler);
					r.put('/users/'+res.user+'/activate').type("json").send({code:res.code}).expect(200,cb);
				}
			],done);
		});
		it('should succeed for known user with handler', function(done){
			var email, handler;
			async.waterfall([
				function (cb) {r.post('/usersnext').expect('activator','createActivateHandler').expect(201,cb);},
				function (res,cb) {
					res.text.should.equal("2");
					email = users["2"].email;
					handler = aHandler(email,cb);
					mail.bind(email,handler);
				},
				function (res,cb) {
					mail.unbind(email,handler);
					r.put('/usersnext/'+res.user+'/activate').type("json").send({code:res.code}).expect('activator','completeActivateHandler').expect(200,cb);
				}
			],done);
		});
  });
	describe('password reset', function(){
	  it('should send 400 for no email or ID passed', function(done){
			r.post("/passwordreset").expect(400,done);
	  });
	  it('should send 400 for no email or ID passed with handler', function(done){
			r.post("/passwordresetnext").expect('activator','createResetHandler').expect(400,done);
	  });
	  it('should send 404 for unknown email or ID', function(done){
			r.post("/passwordreset").type('json').send({user:"john@john.com"}).expect(404,done);
	  });
	  it('should send 404 for unknown email or ID with handler', function(done){
			r.post("/passwordresetnext").type('json').send({user:"john@john.com"}).expect('activator','createResetHandler').expect(404,done);
	  });
		it('should fail for known email but bad code', function(done){
			var email = users["1"].email, handler;
			async.waterfall([
				function (cb) {
					r.post('/passwordreset').type('json').send({user:email}).expect(201,cb);},
				function (res,cb) {
					handler = rHandler(email,cb);
					mail.bind(email,handler);},
				function (res,cb) {
					mail.unbind(email,handler);
					r.put('/passwordreset/'+res.user).type("json").send({code:"asasqsqsqs",password:"asasa"}).expect(400,cb);
				}
			],done);
		});
		it('should fail for known email but bad code with handler', function(done){
			var email = users["1"].email, handler;
			async.waterfall([
				function (cb) {
					r.post('/passwordresetnext').type('json').send({user:email}).expect('activator','createResetHandler').expect(201,cb);},
				function (res,cb) {
					handler = rHandler(email,cb);
					mail.bind(email,handler);},
				function (res,cb) {
					mail.unbind(email,handler);
					r.put('/passwordresetnext/'+res.user).type("json").send({code:"asasqsqsqs",password:"asasa"}).expect('activator','completeResetHandler').expect(400,cb);
				}
			],done);
		});
		it('should fail for known email with good code but missing new password', function(done){
			var email = users["1"].email, handler;
			async.waterfall([
				function (cb) {r.post('/passwordreset').type('json').send({user:email}).expect(201,cb);},
				function (res,cb) {handler = rHandler(email,cb); mail.bind(email,handler);},
				function (res,cb) {
					mail.unbind(email,handler);
					r.put('/passwordreset/'+res.user).type("json").send({code:res.code}).expect(400,cb);
				}
			],done);
		});
		it('should fail for known email with good code but missing new password with handler', function(done){
			var email = users["1"].email, handler;
			async.waterfall([
				function (cb) {r.post('/passwordresetnext').type('json').send({user:email}).expect('activator','createResetHandler').expect(201,cb);},
				function (res,cb) {handler = rHandler(email,cb); mail.bind(email,handler);},
				function (res,cb) {
					mail.unbind(email,handler);
					r.put('/passwordresetnext/'+res.user).type("json").send({code:res.code}).expect('activator','completeResetHandler').expect(400,cb);
				}
			],done);
		});
		it('should fail for expired reset code', function(done){
			var user = users["1"], email = user.email, handler;
			async.waterfall([
				function (cb) {r.post('/passwordreset').type('json').send({user:"1"}).expect(201,cb);},
				function (res,cb) {handler = rHandler(email,cb); mail.bind(email,handler);},
				function (res,cb) {
					mail.unbind(email,handler);
					user.password_reset_time = 100;
					r.put('/passwordreset/'+res.user).type("json").send({code:res.code,password:"abcdefgh"}).expect(400,cb);
				}
			],done);
		});
		it('should fail for expired reset code with handler', function(done){
			var user = users["1"], email = user.email, handler;
			async.waterfall([
				function (cb) {r.post('/passwordresetnext').type('json').send({user:"1"}).expect('activator','createResetHandler').expect(201,cb);},
				function (res,cb) {handler = rHandler(email,cb); mail.bind(email,handler);},
				function (res,cb) {
					mail.unbind(email,handler);
					user.password_reset_time = 100;
					r.put('/passwordresetnext/'+res.user).type("json").send({code:res.code,password:"abcdefgh"}).expect('activator','completeResetHandler').expect(400,cb);
				}
			],done);
		});
		it('should succeed for known ID', function(done){
			var email = users["1"].email, handler;
			async.waterfall([
				function (cb) {r.post('/passwordreset').type('json').send({user:"1"}).expect(201,cb);},
				function (res,cb) {handler = rHandler(email,cb); mail.bind(email,handler);},
				function (res,cb) {
					mail.unbind(email,handler);
					r.put('/passwordreset/'+res.user).type("json").send({code:res.code,password:"abcdefgh"}).expect(200,cb);
				}
			],done);
		});
		it('should succeed for known ID with handler', function(done){
			var email = users["1"].email, handler;
			async.waterfall([
				function (cb) {r.post('/passwordresetnext').type('json').send({user:"1"}).expect('activator','createResetHandler').expect(201,cb);},
				function (res,cb) {handler = rHandler(email,cb); mail.bind(email,handler);},
				function (res,cb) {
					mail.unbind(email,handler);
					r.put('/passwordresetnext/'+res.user).type("json").send({code:res.code,password:"abcdefgh"}).expect('activator','completeResetHandler').expect(200,cb);
				}
			],done);
		});
		it('should succeed for known email', function(done){
			var email = users["1"].email, handler;
			async.waterfall([
				function (cb) {r.post('/passwordreset').type('json').send({user:email}).expect(201,cb);},
				function (res,cb) {handler = rHandler(email,cb); mail.bind(email,handler);},
				function (res,cb) {
					mail.unbind(email,handler);
					r.put('/passwordreset/'+res.user).type("json").send({code:res.code,password:"abcdefgh"}).expect(200,cb);
				}
			],done);
		});
		it('should succeed for known email with handler', function(done){
			var email = users["1"].email, handler;
			async.waterfall([
				function (cb) {r.post('/passwordresetnext').type('json').send({user:email}).expect('activator','createResetHandler').expect(201,cb);},
				function (res,cb) {handler = rHandler(email,cb); mail.bind(email,handler);},
				function (res,cb) {
					mail.unbind(email,handler);
					r.put('/passwordresetnext/'+res.user).type("json").send({code:res.code,password:"abcdefgh"}).expect('activator','completeResetHandler').expect(200,cb);
				}
			],done);
		});
	});
	describe('with email property override', function(){
		before(function(){
		  activator.init({user:userModelEmail,emailProperty:"funny",transport:url,templates:templates,from:from});
		});		  
		it('activate should succeed for known user', function(done){
			var email, handler;
			async.waterfall([
				function (cb) {r.post('/users').expect(201,cb);},
				function (res,cb) {
					res.text.should.equal("2");
					email = users["2"].email;
					handler = aHandler(email,cb);
					mail.bind(email,handler);
				},
				function (res,cb) {
					mail.unbind(email,handler);
					r.put('/users/'+res.user+'/activate').type("json").send({code:res.code}).expect(200,cb);
				}
			],done);
		});
		it('password reset should succeed for known email', function(done){
			var email = users["1"].email, handler;
			async.waterfall([
				function (cb) {r.post('/passwordreset').type('json').send({user:email}).expect(201,cb);},
				function (res,cb) {handler = rHandler(email,cb); mail.bind(email,handler);},
				function (res,cb) {
					mail.unbind(email,handler);
					r.put('/passwordreset/'+res.user).type("json").send({code:res.code,password:"abcdefgh"}).expect(200,cb);
				}
			],done);
		});
	});
	describe('with id property override', function(){
		before(function(){
		  activator.init({user:userModel,transport:url,templates:templates,id:'id',from:from});
		});
		it('activate should succeed for known user', function(done){
			var email, handler;
			async.waterfall([
				function (cb) {r.post('/users').type('json').send({email:"foo@bar.com"}).expect(201,cb);},
				function (res,cb) {
					res.text.should.equal("2");
					email = users["2"].email;
					handler = aHandler(email,cb);
					mail.bind(email,handler);
				},
				function (res,cb) {
					mail.unbind(email,handler);
					r.put('/users/'+email+'/activate').type("json").send({code:res.code}).expect(200,cb);
				}
			],done);
		});
		it('password reset should succeed for known email', function(done){
			var email = users["1"].email, handler;
			async.waterfall([
				function (cb) {r.post('/passwordreset').type('json').send({user:email}).expect(201,cb);},
				function (res,cb) {handler = rHandler(email,cb); mail.bind(email,handler);},
				function (res,cb) {
					mail.unbind(email,handler);
					r.put('/passwordreset/'+email).type("json").send({code:res.code,password:"abcdefgh"}).expect(200,cb);
				}
			],done);
		});
	});
	describe('with html emails', function(){
		var atemplate, htemplate, prtemplate, templatesPath;
		before(function(){
			templatesPath = templates+'/html';
		  activator.init({user:userModel,transport:url,templates:templatesPath,from:from});
			/*jslint stupid:true */
			atemplate = splitTemplate(templatesPath+'/activate.txt');
			htemplate = splitTemplate(templatesPath+'/activate.html');
			prtemplate = splitTemplate(templatesPath+'/passwordreset.html');
			/*jslint stupid:false */
		});
		it('activate should send txt and html', function(done){
			var email, handler;
			async.waterfall([
				function (cb) {r.post('/usersnext').expect(201,"2",cb);},
				function (res,cb) {
					res.text.should.equal("2");
					email = users["2"].email;
					handler = aHandler(email,{text:atemplate[2],html:htemplate[2]},cb);
					mail.bind(email,handler);
				},
				function (res,cb) {
					mail.unbind(email,handler);
					cb();
				}
			],done);
		});
		it('password reset should send only html', function(done){
			var email = users["1"].email, handler;
			async.waterfall([
				function (cb) {r.post('/passwordreset').type('json').send({user:email}).expect(201,cb);},
				function (res,cb) {handler = rHandler(email,cb); mail.bind(email,handler);},
				function (res,cb) {
					mail.unbind(email,handler);
					r.put('/passwordreset/1').type("json").send({code:res.code,password:"abcdefgh"}).expect(200,cb);
				}
			],done);
		});
	});


	describe('localized', function(){
		var parts, templatesPath;
		before(function(){
			templatesPath = templates+'/locale';
		  activator.init({user:userModel,transport:url,templates:templatesPath,from:from});
			/*jslint stupid:true */
			parts = {
				txt: {
					en_GB : splitTemplate(templatesPath+'/activate_en_GB.txt'),
					fr : splitTemplate(templatesPath+'/activate_fr.txt'),
					fallback : splitTemplate(templatesPath+'/activate.txt')
				},
				html: {
					en_GB : splitTemplate(templatesPath+'/activate_en_GB.html'),
					fr : splitTemplate(templatesPath+'/activate_fr.html'),
					fallback : splitTemplate(templatesPath+'/activate.html')
				}
			};
			/*jslint stupid:false */
		});
		it('activate should send txt and html for exact match', function(done){
			var email, handler;
			lang = 'en_GB';
			async.waterfall([
				function (cb) {r.post('/usersnext').expect(201,"2",cb);},
				function (res,cb) {
					res.text.should.equal("2");
					email = users["2"].email;
					handler = aHandler(email,{subject:parts.txt.en_GB[1],text:parts.txt.en_GB[2],html:parts.html.en_GB[2]},cb);
					mail.bind(email,handler);
				},
				function (res,cb) {
					mail.unbind(email,handler);
					cb();
				}
			],done);
		});
		it('activate should send txt and html fallback to lang', function(done){
			var email, handler;
			lang = 'fr_FR';
			async.waterfall([
				function (cb) {r.post('/usersnext').expect(201,"2",cb);},
				function (res,cb) {
					res.text.should.equal("2");
					email = users["2"].email;
					handler = aHandler(email,{subject:parts.txt.fr[1],text:parts.txt.fr[2],html:parts.html.fr[2]},cb);
					mail.bind(email,handler);
				},
				function (res,cb) {
					mail.unbind(email,handler);
					cb();
				}
			],done);
		});
		it('activate should send txt and html default for no match', function(done){
			var email, handler;
			lang = 'he_IL';
			async.waterfall([
				function (cb) {r.post('/usersnext').expect(201,"2",cb);},
				function (res,cb) {
					res.text.should.equal("2");
					email = users["2"].email;
					handler = aHandler(email,{subject:parts.txt.fallback[1],text:parts.txt.fallback[2],html:parts.html.fallback[2]},cb);
					mail.bind(email,handler);
				},
				function (res,cb) {
					mail.unbind(email,handler);
					cb();
				}
			],done);
		});
	});
};

describe('activator', function(){
	before(function(){
	  mail = smtp.init(MAILPORT,{disableDNSValidation:true,disableSTARTTLS:true});
		app.use(bodyParser.json());
		app.use(setLang);
		app.post('/usersbad',activator.createActivate);
		app.post('/users',createUser,activator.createActivate);
		app.post('/usersnext',createUser,activator.createActivateNext,createActivateHandler);
		app.put('/users/:user/activate',activator.completeActivate);
		app.put('/usersnext/:user/activate',activator.completeActivateNext,completeActivateHandler);
		app.post('/passwordreset',activator.createPasswordReset);
		app.put('/passwordreset/:user',activator.completePasswordReset);
		app.post('/passwordresetnext',activator.createPasswordResetNext,createResetHandler);
		app.put('/passwordresetnext/:user',activator.completePasswordResetNext,completeResetHandler);
	});
	describe('not initialized', function(){
    it('activate should send 500', function(done){
			r.post('/users').type("json").send({name:"john"}).expect(500,done);
    });
    it('completeactivate should send 500', function(done){
			r.put('/users/1/activate').type("json").send({code:"12345"}).expect(500,done);
    });
    it('passwordreset should send 500', function(done){
			r.post('/passwordreset').type("json").send({name:"john"}).expect(500,done);
    });
    it('completepasswordreset should send 500', function(done){
			r.put('/passwordreset/1').type("json").send({password:"abcd",code:"12345"}).expect(500,done);
    });
    it('activatenext should send 500', function(done){
			r.post('/usersnext').type("json").send({name:"john"}).expect('activator','createActivateHandler').expect(500,done);
    });
    it('completeactivatenext should send 500', function(done){
			r.put('/usersnext/1/activate').type("json").send({code:"12345"}).expect('activator','completeActivateHandler').expect(500,done);
    });
    it('passwordresetnext should send 500', function(done){
			r.post('/passwordresetnext').type("json").send({name:"john"}).expect('activator','createResetHandler').expect(500,done);
    });
    it('completepasswordresetnext should send 500', function(done){
			r.put('/passwordresetnext/1').type("json").send({password:"abcd",code:"12345"}).expect('activator','completeResetHandler').expect(500,done);
    });
	});
	describe('initialized', function(){
		describe('with string transport', function(){
			before(function(){
			  activator.init({user:userModel,transport:url,templates:templates,from:from});
			});
			allTests();
		});
		describe('with nodemailer transport', function(){
			before(function(){
			  activator.init({user:userModel,transport:mailer.createTransport(maileropts),templates:templates,from:from});
			});
			allTests();
		});
	});
});