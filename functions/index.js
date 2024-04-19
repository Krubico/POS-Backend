/* eslint-disable max-len */
/* eslint-disable quotes */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {Timestamp} = require("firebase-admin/firestore");
admin.initializeApp();
const db = admin.firestore();
const privateOAuth2Credentials = require('./OAuth2Creds.json');
const senderEmailAccount = require('./EmailCreds.json');


exports.authenticate = functions
    .region("asia-southeast2")
    .https.onRequest(async (req, res) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      try {
        if (req.method === "POST") {
          //    Check if required keys are present
          const username = JSON.parse(req.body).username;
          const password = JSON.parse(req.body).password;

          //    Either one not present send back 400
          if (typeof username === "undefined" || typeof password === "undefined") {
            res
                .status(400)
                .send("Bad request, one or more parameters are not provided");
            return;
          }

          //    Database query
          const users = db.collection("users");
          const userSnapshot = await users
              .where("username", "==", username)
              .where("password", "==", password)
              .get();

          //    Check if can find matching entry
          if (userSnapshot.empty) {
            //  No results invalid username or password, auth failed
            res.status(200).json({
              authStatus: "failed",
            });

            return;
          } else {
            let isAdmin = false;
            // Check if user is supervisor
            userSnapshot.docs.forEach((doc) => {
              isAdmin = doc.data()["isAdmin"];
            });

            res.status(200).json({
              authStatus: isAdmin ? "admin" : "notAdmin",
            });

            return;
          }
        } else {
          res.status(403).send({message: "Not a valid method"});
          console.log("Invalid method", req.method);
          return;
        }
      } catch (err) {
        //  We do not know what went wrong, send back 500
        res.status(500).send({message: "Internal Server Error"});
        console.log(err);
        return;
      }
    });


exports.addRecordbytransactionID = functions
    .region("asia-southeast2")
    .https.onRequest(async (data, context) => {
      try {
        context.set("Access-Control-Allow-Origin", "*");
        context.set("Access-Control-Allow-Methods", "GET, OPTIONS");
        if (data.method === "POST") {
          const transactionID = JSON.parse(data.body).transactionID;
          // eslint-disable-next-line new-cap
          // ! Date must be in UTC+8 format
          const dateTimeCalculated = Math.floor(Date.parse(JSON.parse(data.body).dateTimeOfPayment) / 1000);
          const dateTimeOfPayment = new Timestamp(dateTimeCalculated, 0);
          // * Creates new document || Overwrites existing ALL DOCUMENT FIELDS
          const transactionRef = db.collection("records").doc(transactionID);

          // ? staffName should not be updated
          await transactionRef.set({
            itemsOrdered: JSON.parse(data.body).itemsOrdered,
            totalAmount: JSON.parse(data.body).totalAmount,
            paymentMethod: JSON.parse(data.body).paymentMethod,
            dateTimeOfPayment: dateTimeOfPayment,
          }, {merge: true});

          context.status(200).send({message: "Sucessfully Added Record"});
          return;
        } else {
          context.status(403).send({message: "Not a valid method"});
          return;
        }
      } catch (err) {
        context.status(500).send({message: "Internal Server Error"});
        console.log(err);
        return;
      }
    });

// Provide Records from 00:00::00 untilnow
// Sort the Records
// Sum up the
exports.getDailySalesReport = functions
    .region("asia-southeast2")
    .https.onRequest(async (req, res) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      try {
        const dayjs = require("dayjs");
        const utc = require("dayjs/plugin/utc");
        dayjs.extend(utc);
        if (req.method === "GET") {
          // UTC+8 Format
          const startOfDay = dayjs.utc().add(8, "hour").startOf("day").format(); // set to 12:00 am today
          const endOfDay = dayjs.utc().add(8, "hour").endOf("day").format(); // set to 23:59 pm today
          const startDateTime = new Date(startOfDay);
          const endDateTime = new Date(endOfDay);

          const records = db.collection("records");
          const totalDayRecords = await records
              .orderBy("dateTimeOfPayment")
              .where("dateTimeOfPayment", ">=", startDateTime)
              .where("dateTimeOfPayment", "<=", endDateTime)
              .get();

          // Initailises records___Method to by send to front-end with first load
          const recordsCashMethod = totalDayRecords.docs
              .filter((doc) => doc.data()["paymentMethod"] == "Cash");

          let totalAmountbyCash = 0;
          let numberOfCashPayments = 0;
          if (recordsCashMethod.empty) {
            console.log("No Cash Methods Used");
          } else {
            recordsCashMethod.forEach((doc) => {
              totalAmountbyCash += doc.data()["totalAmount"];
              numberOfCashPayments += 1;
            });
          }

          const recordsCreditMethod = totalDayRecords.docs
              .filter((doc) => doc.data()["paymentMethod"] == "Credit");

          let totalAmountbyCredit = 0;
          let numberOfCreditPayments = 0;
          if (recordsCreditMethod.empty) {
            console.log("No Credit Methods Used");
          } else {
            recordsCreditMethod.forEach((doc) => {
              totalAmountbyCredit += doc.data()["totalAmount"];
              numberOfCreditPayments += 1;
            });
          }

          const recordsBankTransferMethod = totalDayRecords.docs
              .filter((doc) => doc.data()["paymentMethod"] == "BankTransfer");

          let totalAmountbyBankTransfer = 0;
          let numberOfBankTransferPayments = 0;
          if (recordsBankTransferMethod.empty) {
            console.log("No Bank Transfer Methods Used");
          } else {
            recordsBankTransferMethod.forEach((doc) => {
              totalAmountbyBankTransfer += doc.data()["totalAmount"];
              numberOfBankTransferPayments += 1;
            });
          }
          const formattedTotalDayRecords = [];
          totalDayRecords.forEach((doc) => {
            formattedTotalDayRecords.push({
              transactionID: doc.id,
              dateTimeOfPayment: doc.data()["dateTimeOfPayment"],
              staffName: doc.data()["staffName"],
              totalAmount: doc.data()["totalAmount"],
              paymentMethod: doc.data()["paymentMethod"],
            });
          });

          res.set("Access-Control-Allow-Origin", "*");
          res.set("Access-Control-Allow-Methods", "GET, OPTIONS");

          res.send({
            totalDayRecords: formattedTotalDayRecords,
            totalAmountbyCash: totalAmountbyCash,
            numberOfCashPayments: numberOfCashPayments,
            totalAmountbyCredit: totalAmountbyCredit,
            numberOfCreditPayments: numberOfCreditPayments,
            totalAmountbyBankTransfer: totalAmountbyBankTransfer,
            numberOfBankTransferPayments: numberOfBankTransferPayments,
          });
          return;
        } else {
          res.status(403).send({message: "Not a valid method"});
          return;
        }
      } catch (err) {
        res.status(500).send({message: "Internal Server Error"});
        console.log(err);
        return;
      }
    });

exports.getDailyFilteredRecords = functions
    .region("asia-southeast2")
    .https.onRequest(async (req, res) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      try {
        if (req.method === "GET") {
          const recordFilter = req.query.recordFilter;
          const recordFilterValue = req.query.recordFilterValue;
          const records = db.collection("records");
          const totalFilteredDailyRecords = await records
              .orderBy("dateTimeOfPayment")
              .where(recordFilter, "==", recordFilterValue)
              .get();

          console.log(totalFilteredDailyRecords.docs);

          if (totalFilteredDailyRecords.empty) {
            res.status(204).send({message: "No Records Found"});
            return;
          } else {
            const formattedFilteredDailyRecords = [];
            totalFilteredDailyRecords.forEach((doc) => {
              formattedFilteredDailyRecords.push({
                transactionID: doc.id,
                dateTimeOfPayment: doc.data()["dateTimeOfPayment"],
                staffName: doc.data()["staffName"],
                totalAmount: doc.data()["totalAmount"],
                paymentMethod: doc.data()["paymentMethod"],
              });
            });
            res.send(formattedFilteredDailyRecords);
            return;
          }
        } else {
          res.status(403).send({message: "Not a valid method"});
          return;
        }
      } catch (err) {
        res.status(500).send({message: "Internal Server Error"});
        console.log(err);
        return;
      }
    });

exports.getFilteredProducts = functions
    .region("asia-southeast2")
    .https.onRequest(async (req, res) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      try {
        if (req.method === "GET") {
          const recordFilter = req.query.recordFilter;
          const recordFilterValue = req.query.recordFilterValue;
          const products = db.collection("products");
          if (typeof recordFilter === "undefined" && typeof recordFilterValue === "undefined") {
            const totalFilteredProducts = await products
                .get();
            if (totalFilteredProducts.empty) {
              res.status(200).send({successCode: 0, listOfProducts: "No Products Found"});
              return;
            } else {
              const formattedFilteredProducts = [];
              totalFilteredProducts.forEach((doc) => {
                formattedFilteredProducts.push({
                  productName: doc.data()["productName"],
                  productprice: doc.data()["productPrice"],
                  productOptions: doc.data()["productOptions"],
                });
              });
              res.send({successCode: 1, listOfProducts: formattedFilteredProducts});
              return;
            }
          } else if (typeof recordFilter === "string" && typeof recordFilterValue === "string") {
            const totalFilteredProducts = await products
                .where(recordFilter, "==", recordFilterValue)
                .get();
            if (totalFilteredProducts.empty) {
              res.send({successCode: 0, listOfProducts: "No Products Found"});
              return;
            } else {
              const formattedFilteredProducts = [];
              totalFilteredProducts.forEach((doc) => {
                formattedFilteredProducts.push({
                  productName: doc.data()["productName"],
                  productprice: doc.data()["productPrice"],
                  productOptions: doc.data()["productOptions"],
                });
              });
              res.send({successCode: 1, listOfProducts: formattedFilteredProducts});
              return;
            }
          } else {
            res.status(403).send({message: "Query Error"});
          }
        } else {
          res.status(403).send({message: "Not a valid method"});
          return;
        }
      } catch (err) {
        res.status(500).send({message: "Internal Server Error"});
        console.log(err);
        return;
      }
    });


const clientEmailAccount = {
  EMAIL_ADDRESS: "MasterJH8000@gmail.com",
};

const mailConfigurations = {

  // It should be a string of sender email
  from: senderEmailAccount.EMAIL_ADDRESS,

  // Comma Separated list of mails
  to: clientEmailAccount.EMAIL_ADDRESS,

  // Subject of Email
  subject: "Sending Email using Node.js",

  // This would be the text of email body
  attachments: [{
    filename: "dailySales.xlsx",
    path: "./dailySales.xlsx",
  }],
};


exports.sendSalesReportToEmail = functions
    .region("asia-southeast2")
    .runWith({
      memory: "512MB",
    })
    .https.onRequest(async (req, res) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      try {
        const nodemailer = require("nodemailer");
        const dayjs = require("dayjs");
        const utc = require("dayjs/plugin/utc");
        dayjs.extend(utc);


        // * Nodejs XLSX Library Set-up
        const XLSX = require("xlsx");
        const fs = require("fs");
        // * UTC+8 Format
        const startOfDay = dayjs.utc().add(8, "hour").startOf("day").format(); // set to 12:00 am today
        const endOfDay = dayjs.utc().add(8, "hour").endOf("day").format(); // set to 23:59 pm today
        const startDateTime = new Date(startOfDay);
        const endDateTime = new Date(endOfDay);

        const records = db.collection("records");
        const totalDayRecords = await records
            .orderBy("dateTimeOfPayment")
            .where("dateTimeOfPayment", ">=", startDateTime)
            .where("dateTimeOfPayment", "<=", endDateTime)
            .get();

        const formattedTotalDayRecords = [];
        // ? Dependent on cloud function JSON data model
        totalDayRecords.forEach((doc) => {
          const dateTimeOfPayment = dayjs(doc.data()["dateTimeOfPayment"].toDate());
          const timeMinutes = dateTimeOfPayment.get("hour").toString();
          const timeHours = dateTimeOfPayment.get("minute").toString();
          const timeSeconds = dateTimeOfPayment.get("second").toString();
          formattedTotalDayRecords.push({
            // ? Dependent on whether returned dateTimeOnPayment is form string
            // ! ITEMS ORDERED MISSING
            transactionID: doc.id,
            dateTimeOfPayment: (timeHours + ":" + timeMinutes + ":" + timeSeconds),
            staffName: doc.data()["staffName"],
            totalAmount: doc.data()["totalAmount"],
            paymentMethod: doc.data()["paymentMethod"],
          });
        });
        console.log(formattedTotalDayRecords);
        // * XLSX library Data Model: https://docs.sheetjs.com/docs/getting-started/example
        const dailySalesWorkbook = XLSX.utils.book_new();
        const dailySalesWorksheet = XLSX.utils.json_to_sheet(formattedTotalDayRecords);
        console.log(dailySalesWorksheet);

        XLSX.utils.book_append_sheet(dailySalesWorkbook, dailySalesWorksheet, "Sheet1");

        // ? Can Change to other fie format for performance
        // * Create then delete file form tmp directory
        const writeAndSaveSalesWorksheet = new Promise((resolve, reject) => {
          XLSX.writeFile(dailySalesWorkbook, "dailySales.xlsx");
        });
        const deleteSalesWorksheet = (async () => {
          fs.unlink("dailySales.xlsx", (err) => {
            console.log(err);
            return;
          });
        });

        const emailSender = nodemailer.createTransport({
          service: "gmail",
          secure: true,
          auth: {
            type: "OAuth2",
            user: senderEmailAccount.EMAIL_ADDRESS,
            pass: senderEmailAccount.PASSWORD,
            clientId: privateOAuth2Credentials.CLIENT_ID,
            clientSecret: privateOAuth2Credentials.CLIENT_SECRET,
            refreshToken: privateOAuth2Credentials.REFRESH_TOKEN,
          },
        });

        emailSender.sendMail(mailConfigurations, function(error, info) {
          if (error) throw Error(error);
          console.log("Email Sent Successfully");
          console.log(info);
        });

        writeAndSaveSalesWorksheet.then(() => deleteSalesWorksheet());
        res.send({message: "Email Sent Successfully"});
        return;
      } catch (err) {
        res.status(500).send({message: "Internal Server Error"});
        console.log(err);
        return;
      }
    });

