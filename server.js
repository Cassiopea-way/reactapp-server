const express = require("express");
let http = require("http");
const app = express();
let server = http.createServer(app);
let cors = require('cors');
let io = require('socket.io')(server,{
    cors: {
        origin: "*",
        methods: ["GET","POST"]
    }
});
let nodemailer = require('nodemailer');
let smtptransport = require('nodemailer-smtp-transport');
let fs = require('fs');
const multer = require('multer');
let favicon = require('serve-favicon');
//let cors = require('cors');
let path = require('path');
const bodyParser = require("body-parser");
const session = require('express-session');
const MongoStore = require('connect-mongo');
let bcrypt = require('bcryptjs');
const util = require('util');
const mm = require('music-metadata');

let randomnumberSMS;
let randomnumberEMAIL

const MongoClient = require("mongodb").MongoClient;
const objectId = require("mongodb").ObjectID;

let smtpTransport = nodemailer.createTransport(smtptransport({
    host:"smtp.mail.ru",
    port:'465',
    //host:"localhost",
    //port:'8888',
    secure:'true',
    /*tls: {
        rejectUnauthorized:false
    },*/
    auth: {
        user:"marochkins@bk.ru",
        pass:"sr71blackbird",
    },
    
}));

let dbClient;
 
const mongoClient = new MongoClient("mongodb://localhost:27017/", { useUnifiedTopology: true });

app.use(session({
	secret:'secret key',
	ttl:60,
	saveUninitialized:true,
	resave:true,
	store: MongoStore.create({
		mongoUrl:'mongodb://localhost:27017/',
		dbName:'basesessions',
		collectionName:'testsessions',
	})
}));

mongoClient.connect(function(err, client){
 
    if(err){
        return console.log(err);
    }

    dbClient = client;
    //app.locals.collection = client.db("test").collection("users");
    app.locals.collection = client.db("test");
    // взаимодействие с базой данных
    console.log('database-->OK');
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:true}));

//app.use(cors);

app.use(favicon((__dirname + '/public/images/favicon.ico')));
app.use(express.static(__dirname + '/public'));
app.use(express.static(__dirname + '/pages'));
app.use(express.static(__dirname + '/uploads'));
app.use(express.static(__dirname + '/uploads/music'));
app.use(express.static(__dirname + '/client'));
app.use(express.static(__dirname + '/client/src/currentsong'));
console.log(path.basename('/client/src/pages/AuthPage.txt'));

const storagefile = multer.diskStorage({
    destination:(request,file,cb) => {
      if (file.mimetype == 'audio/mpeg'){
        fs.mkdir('uploads/music/' + request.session.user.username,{recursive:true},(err) => {
           if (err) throw err;
           console.log('папка успешно создана');
        });
        cb(null,"uploads/music/" + request.session.user.username);
      }
       if ((file.mimetype == 'image/png') || (file.mimetype == 'image/jpeg') || (file.mimetype == 'image/gif')){
         cb(null,"client/src/userphoto/");
      }
      //cb(null,"uploads");
    },
    filename:(request,file,cb) => {
      if (file.mimetype == 'audio/mpeg'){
         cb(null,file.originalname);
      }
      if ((file.mimetype == 'image/png') || (file.mimetype == 'image/jpeg') || (file.mimetype == 'image/gif')){
         cb(null,request.session.user.username + file.originalname.substr(file.originalname.length - 4));
      }    
    }
})

const upload = multer({storage:storagefile});

app.use(multer({storage:storagefile}).single("file"));

io.on('connection',(socket) => {
      console.log('user connected :',socket.id);
        const collection = app.locals.collection;

        socket.on('JOIN',async(data) => {
          console.log(data);
          data.socketid = socket.id;
         
         let queries = [new Promise(function(resolve,reject){
                         collection.collection("chatroom").insertOne(data,function(err, insertuser){    
                         console.log('1');
                         resolve();
                         if(err) return console.log(err);
                       });
                       }),
                       new Promise(function(resolve,reject){
                         collection.collection('chatroom').find().toArray(function(err,chatroomusers){
                         console.log(chatroomusers);
                         console.log('2');
                         let usersinroom = [];
                         for (let i = 0; i < chatroomusers.length; i++){
                           usersinroom.push(chatroomusers[i].joinuser);
                         }
                         console.log(usersinroom);
                         resolve(usersinroom);
                         if (err) throw err;
                         });
                       }),
                       new Promise(function(resolve,reject){
                         collection.collection('chatmessages').find().toArray(function(err,messages){
                         console.log(messages);
                         console.log('3');
                         resolve(messages);
                       });
                       })

         ];

         console.log(queries);

         Promise.all(queries).then(function(results){
           console.log(results);
           socket.broadcast.emit('JOINED',results[1]);
           socket.emit('GETMESSAGES',results[2]);
         }).catch(function(err){
           console.log(err);
         });

        });

        /*socket.emit('CONNECTION_USER',(data) => {
          console.log('user connected');
        });*/

        socket.on('NEW_MESSAGE',async(data) => {
          console.log(data);
          let copy = {};
          copy.authuser = data.user;
          copy.usermessage = data.inputValue;
          let messageid;
          
          let queries = [new Promise(function(resolve,reject){
                           collection.collection('chatmessages').insertOne(copy,function(err, insertmessage){
                           console.log('4');
                           console.log(insertmessage);
                           resolve();
                           if(err) return console.log(err);
                        }); 
                        }),
                        new Promise(function(resolve,reject){
                           collection.collection('chatmessages').find().limit(1).sort({$natural:-1}).toArray(function(err,findmessage){
                           console.log(findmessage);
                           console.log('5');
                           resolve(findmessage);
                           if(err) return console.log(err);
                        });
                        })];

          console.log(queries);

          Promise.all(queries).then(function(results){
          console.log(results);
          socket.broadcast.emit('SET_MESSAGE',results[1]);
         }).catch(function(err){
            console.log(err);
         }); 

        });

        socket.on('disconnect',async() => {
            console.log('disconnected');
            
            let queries = [new Promise(function(resolve,reject){
                            collection.collection('chatroom').deleteOne({socketid:socket.id},function(err,deleteuser){
                            console.log('6');
                            console.log(deleteuser);
                            resolve();
                            if (err) return console.log(err);
                          });
                          }),
                          new Promise(function(resolve,reject){
                            collection.collection('chatroom').find().toArray(function(err,chatroomusers){
                            console.log(chatroomusers);
                            console.log('7');
                            let usersinroom = [];
                            for (let i = 0; i < chatroomusers.length; i++){
                              usersinroom.push(chatroomusers[i].joinuser);
                            }
                            console.log(usersinroom);
                            resolve(usersinroom); 
                            if (err) throw err;
                          });
                          })
            ];

            console.log(queries);

            Promise.all(queries).then(function(results){
            console.log(results);
            socket.broadcast.emit('LEAVE',results[1]);
         }).catch(function(err){
            console.log(err);
         }); 

        });
      });

function getRandomInt(min,max){
  return Math.floor(Math.random()*(max - min + 1)) + min;
}

app.get("/api",function(request,response){
     console.log(request.session);
  if (request.session.hasOwnProperty('user') === false){
      response.send('пользователь не авторизован');
  } else {
      console.log(request.session.user.username);
      response.send(request.session.user.username);
  }
    
});

app.get("/getusers",function(request,response){
   const collection = app.locals.collection;
   collection.collection('chatroom').find().toArray(function(err,chatroomusers){
      console.log(chatroomusers);
      response.send(chatroomusers);
   });
});

/*app.get("/login",function(request,response){
    response.render('login');
    //response.render('login');
});*/

app.post("/login",function(request,response){

    let login = request.body.userLogin;
    let password = request.body.userPassword;
    let foundUser;
    let check;
    let correctpass;
    console.log(request.body);
    console.log(login);
    console.log(password);
    const collection = request.app.locals.collection;

    collection.collection('users').findOne({userLogin:login},function(err, correctuser){
        //console.log(collection);
        if(err) return console.log(err);
         //response.send(users);
        if (correctuser == undefined){

           console.log("Login failed: ",request.body.userlogin);
           response.status(401).send('Login Error');

        } else {
           correctpass = correctuser.userPassword;
           check = bcrypt.compareSync(password,correctpass);
           if (check == true){
           let sessionData = request.session;
           sessionData.user = {};
           let username = login;
           sessionData.user.username = username;
           console.log("Login succeeded: ",sessionData.user.username);
           console.log('Login successfull ' + 'sessionID: ' + request.session.id + '; user: ' + sessionData.user.username);
           //response.send('Login successfull ' + 'sessionID: ' + request.session.id + '; user: ' + sessionData.user.username);
           response.json({"user":username,"authstatus":"auth is OK"});
          }
        }
   
    })

});

app.get('/logout',function(request,response){
    request.session.destroy(function(err){
      if (err) {
        throw err;
      } else {
        console.log('logged out');
        response.send('logged out!');
      }
    });
});

app.get('/admin',function(request,response){
	let sessionData = request.session;
	console.log(sessionData.user.username);
	if (sessionData.user.username == 'admin'){
		console.log(sessionData.user.username + ' requested admin page');
		response.render('admin');
	} else {
		response.status(403).send('Access Denied!');
	}
});

app.post("/registeruser",function(request,response){
    let username = request.body.userName;
    let usersurname = request.body.userSurname;
	  let login = request.body.userLogin;
	  let password = request.body.userPassword;
	  let email = request.body.userEmail;
    let phone = request.body.userPhone;

    let salt = bcrypt.genSaltSync(10);
    let hash = bcrypt.hashSync(password,salt);

    let User = {userName:username,
    	          userSurname:usersurname,
    	          userLogin:login,
    	          userPassword:hash,
    	          userEmail:email,
                useremailActive:false,
                userPhone:phone,
                userphoneActive:false,
                languages: [ 'english', 'spanish', 'russian' ]
    	        };
   
    const collection = request.app.locals.collection;
    collection.insertOne(User,function(err, insertuser){
        //console.log(collection);
        if(err) return console.log(err);
        response.json({insertuser,"registration":"registration is completed"});
    });

});

app.get('/user',function(request,response){
	let sessionData = request.session;
    console.log(sessionData.user.username);
    console.log(request.url);
	if (sessionData.user.username != "admin"){
		console.log(sessionData.user.username + ' requested user page');
		response.render('user');
	} else {
		response.status(403).send('Access Denied!');
	}
});

app.get('/MyProfilePage',function(request,response){

    const collection = request.app.locals.collection;
    collection.collection('users').findOne({userLogin:request.session.user.username},function(err,user){
        
        response.json(user);

    });
});


app.post('/savephoto',upload.single('file'),function(request,response){
    const collection = request.app.locals.collection;
    let filedata = request.file;
    let loadfilename = filedata.filename;
    console.log(filedata);
    if (!filedata){
        response.send("Ошибка при загрузке файла");
    } else {
        console.log('Файл загружен');

        collection.collection('users').updateOne({userLogin:request.session.user.username},{$set:{userPhoto:'/src/userphoto/' + loadfilename}},function(err,user){
        
          let message = {send:"File image upload"};
          response.json(message);

        });
    }
});

app.post('/savechanges',function(request,response){
    const collection = request.app.locals.collection;
    let changeinfo = request.body;
    console.log(request.body);
    
        if (changeinfo.inputname == "userName"){
          collection.collection('users').updateOne(
            {userLogin:request.session.user.username},   
            { $set: {userName:request.body.change}},
            function(err,result){
                console.log(result,"change is done");
            }
          );
        }

        if (changeinfo.inputname == "userSurname"){
          collection.collection('users').updateOne(
            {userLogin:request.session.user.username},
            { $set: {userSurname:request.body.change}},
            function(err,result){
                console.log(result);
            }
          );
        }

        if (changeinfo.inputname == "userLogin"){
          sessionData.user.username = changeinfo.userLogin;
          collection.collection('users').updateOne(
            {userLogin:request.session.user.username},
            { $set: {userLogin:request.body.change}},
            function(err,result){
                console.log(result);
            }
          );
        }

        if (changeinfo.inputname == "userEmail"){
          collection.collection('users').updateOne(
            {userLogin:request.session.user.username},
            { $set: {userEmail:request.body.change,useremailActive:false}},
            function(err,result){
                console.log(result);
            }
          );
        }

        if (changeinfo.inputname == "userPhone"){
          collection.collection('users').updateOne(
            {userLogin:request.session.user.username},
            { $set: {userPhone:request.body.change,userphoneActive:false}},
            function(err,result){
                console.log(result);
            }
          );
        }

        let message = {send:"change is done"};
        response.json(message);
 
});

app.post('/uploads',upload.single('file'),function(request,response){
    let filedata = request.file;
    let loadfilename = filedata.filename;
    console.log(filedata);
    if (!filedata){
        response.send("Ошибка при загрузке файла");
    } else {
        console.log('Файл загружен');
        response.setHeader("Content-Type","image/jpeg");
        fs.readFile("/study/nodejsprojects/newtest/uploads/" + loadfilename,(err,image) => {
            if (err) throw err;
            response.end(image);
        });
        //response.send("Файл загружен");
    }
});

app.post('/loadsong',upload.single('file'),function(request,response){
    console.log(request.file);
    if (!request.file){
        response.send("Ошибка при загрузке файла");
    } else {
        console.log('Файл загружен');
        /*response.setHeader("Content-Type","audio/mpeg");
        fs.readFile("/study/nodejsprojects/newtest/uploads/music/" + request.file.originalname,(err,song) => {
            if (err) throw err;
            response.end(song);
        });*/
        let message = {send:"File upload"};
        response.json(message);
    }
});

app.get('/playlist',function(request,response){
   let objmetadata = [];
   fs.readdir("uploads/music/" + request.session.user.username,(err,files) => {
      files.forEach((file,index,array) => {
        console.log(file);
        let metadata = mm.parseFile('uploads/music/'+ request.session.user.username +'/' + file);
        console.log(metadata);
        metadata.then(obj => {
          obj.common.originalName = file;
        });
        objmetadata.push(metadata);
        /*if (index == array.length - 1){
           response.json(objmetadata);
        }*/
      });
      console.log(objmetadata);
      Promise.all(objmetadata).then(function(arraydata){
        console.log(arraydata[0].common.title);
        response.json(arraydata);
      });
   });
});

app.post('/getcurrentsong',function(request,response){
    console.log(request.body,'РЕКВЕСТ БОДИ ВОТ ЭТОТ');
    fs.readdir('client/src/currentsong/',(err,files) => {
       if (err) throw err;
       for (const file of files){
         fs.unlink(path.join('client/src/currentsong',file),err => {
           if (err) throw err;
         });
       }
    });
    fs.copyFile('uploads/music/' + request.session.user.username + '/' + request.body.sound,'client/src/currentsong/' + request.body.sound,err => {
       if (err) throw err;
       console.log('файл успешно скопирован');
       response.json(request.body);
    });
});

app.post('/deletesong',function(request,response){
   fs.unlink('uploads/music/' + request.session.user.username + '/' + request.body.sound,err => {
      if (err) throw err;
       console.log('файл успешно удалён');
       response.json(request.body);
   });
});

app.post('/changepassword',function(request,response){

   const collection = request.app.locals.collection;
   let salt = bcrypt.genSaltSync(10);
   let hash = bcrypt.hashSync(request.body.repeatpassword,salt);

    collection.collection('users').updateOne(
            {userLogin:request.session.user.username},
            { $set: {userPassword:hash}},
            function(err,result){
                console.log(result);
                 let message = {send:"change is done"};
                 response.json(message);
            }
          );
   
});

app.get('/sendrandlink',function(request,response){
    let host = request.headers.host;
    console.log(host);
    //let salt = bcrypt.genSaltSync(10);
     randomnumberEMAIL = Math.floor((Math.random()*100) + 54);
    //let hash = bcrypt.hashSync(rand,salt);
    let link = "http://" + host + "verifyemail?id=" + randomnumberEMAIL;

    let sessionData = request.session;
    const collection = request.app.locals.collection;
    collection.collection('users').findOne({userLogin:sessionData.user.username},function(err,user){
        let mailOptions = {
        from:"Nodemailer test <marochkins@bk.ru>",
        to:user.userEmail,
        subject:"Please confirm your Email account",
        html: "Hello, <br> Please click on the link to verify your email.<br><a href = "+link+">Click here to verify</a>"
      };
      console.log(mailOptions);
      smtpTransport.sendMail(mailOptions,function(error,emailmessage){
        if(error){
            console.log(error);
            response.end("error");
        } else {
            console.log("message sent: " + emailmessage);
            let message = {send:"message sent"};
            response.json(message);
            //response.end("sent");
        }
    });

    });
});

app.post('/verifyemail',function(request,response){
    console.log(request.protocol+"://"+request.headers.host);
    if((request.protocol+"://"+request.headers.host) == ("http://"+request.headers.host)){
        console.log("Domain is matched. Information is from Authentic email");
        if (request.stringquery == randomnumberEMAIL){
            console.log("email is verifed");
            //response.end("<h1>Email "+mailOptions.to+" is been Successfully verifed");
            let message = {send:"verification is done"};
            response.json(message);
        } else {
            let message = {send:"email is not verifed"};
            response.json(message);
            //console.log("email is not verifed");
            //response.end("<h1>Bad Request</h1>");  
        }
    }
});

app.get('/sendSMS',function(request,response){
   const accountSid = '';
   const authToken = '';

   const client = require('twilio')(accountSid,authToken);

   randomnumberSMS = getRandomInt(1000,9999);
   
   client.messages
     .create({
        body:'Ваш код подтверждения: ${randomnumberSMS}',
        from:'+17242515396',
        to:'+79276862160'
     })
     .then(message => response.redirect('/verifySMS'));
   response.redirect('/verifySMS');

});

app.get('/verifySMS',function(request,response){
    console.log(randomnumberSMS);
    response.render('verifySMS',{codeSMS:randomnumberSMS});
});

app.post('/SMSisverify',function(request,response){
    let code = request.body.proofcode;
    console.log(request.body);
    console.log(code);
    if (code != randomnumberSMS){
        response.send('Неверный код');
    } else {
        response.redirect('/user/myprofile'); 
    }  
});

app.post('/addmessage',function(request,response){
    const collection = request.app.locals.collection;
    collection.collection("chatmessages").insertOne(request.body,function(err, insertmessage){
        //console.log(collection);
        console.log(request.body);
        console.log('1');
        if(err) return console.log(err);
        response.send('message added');

    });
});

app.get('/guest',function(){	
		response.render('guest page');
});

app.get('/register',function(request,response){	
		response.render('register');
});

process.on("SIGINT", () => {
    dbClient.close();
    process.exit();
});


server.listen(8888);