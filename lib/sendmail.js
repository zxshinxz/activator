/*jslint node:true */
/*global unescape, escape */
var mailer = require('nodemailer');


module.exports = function(turl) {
  var url = require('url').parse(turl||"", true), transport, host, port, auth, from, protocol, sysopts,
  parts, domain, secure;
  // do we have a proper URL?
  url.protocol = url.protocol || "smtp:";
  url.host = url.host || "localhost";
  url.port = url.port || "25";
  url.path = url.path || "/localhost/"+escape("local@localhost");
  
  protocol = url.protocol.replace(/:$/,"").toUpperCase();
  host = url.host.split(":")[0];
  port = parseInt(url.port,10);
  parts = url.path.split(/\//);
  domain = parts[1];
  secure = url.query['secureConnection'] || false;
  from = unescape(parts[2]);
  sysopts = { host: host, port:port, name: domain, secureConnection: secure };
  if (url.auth) {
    auth = url.auth.split(":");
    sysopts.auth = {user:auth[0],pass:auth[1]};
  }

  // create reusable transport method (opens pool of SMTP connections)
  transport = mailer.createTransport(protocol,sysopts);

  return function(to,subject,body,html,cb) {
    var opts = {
      from: from,
      to: to,
      subject: subject,
      text: body,
      forceEmbeddedImages: true,
      attachments: [{
          filename: "mailheader.png",
          filePath: "./assets/mail_template/mailheader.png",
          cid: "hangookdo-mailheader" //same cid value as in the html img src
      },{
          filename: "mailbanner.png",
          filePath: "./assets/mail_template/mailbanner.png",
          cid: "hangookdo-mailbanner" //same cid value as in the html img src
      }],
      html: html
    };
    transport.sendMail(opts,cb);
  };
};
