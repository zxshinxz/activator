/*jslint node:true, nomen:true */

module.exports = function(url,templates){
	var sendmail = require('./sendmail')(url), mailcomposer = require('./mailcomposer');
	mailcomposer.init(templates);
	
	return function(type,lang,data,to,callback) {
		mailcomposer.compile(type,lang,data,function(subject,content,html){
			if (subject && content) {
				sendmail(to,subject,content,html,callback);
			} else {
				callback("missingmailfile");
			}
		});		
	};
};