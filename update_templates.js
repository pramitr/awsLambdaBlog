var co = require("co");
var path = require("path");
var fs = require("fs");
var node_s3_client = require('s3');

var isThere = require("is-there");
var chalk = require('chalk');
var _ = require('lodash');

var webpack = require("webpack");

var uuid = require('uuid');

var zip = require("node-zip");

var config = require('./install/lambda_config.json');


var AWS = require('aws-sdk');
AWS.config.loadFromPath(config.credentials_path);

var s3 = new AWS.S3({
	signatureVersion: 'v4',
	apiVersion: '2006-03-01'
});

co(function*(){
	console.log();
	console.log(chalk.cyan("Uploading files to S3 bucket"));

	var uploadId = yield new Promise(function (resolve, reject) {
		var public_dir = path.join(__dirname, "./public");
		var client = node_s3_client.createClient({
			s3Client: s3,
			maxAsyncS3: 20,     // this is the default
			s3RetryCount: 3,    // this is the default
			s3RetryDelay: 1000, // this is the default
			multipartUploadThreshold: 20971520, // this is the default (20 MB)
			multipartUploadSize: 15728640 // this is the default (15 MB)
		});

		var params = {
			localDir: public_dir,
			deleteRemoved: false,

			s3Params: {
				Bucket: config.bucket_name,
				Prefix: "",
				ACL: "public-read"
			}
		};
		var uploader = client.uploadDir(params);
		uploader.on('error', function (err) {
			console.error("unable to sync:", err.stack);
			reject();
		});

		if (!uploader.filesFound) {
			console.log("no new files found");
			resolve(false);
		} else {
			var files_to_upload = 0;
			var files_uploaded = 0;
			uploader.on('fileUploadStart', function (localFilePath, s3Key) {
				files_to_upload++;
			});

			uploader.on('fileUploadEnd', function (localFilePath, s3Key) {
				files_uploaded++;

				process.stdout.clearLine();
				process.stdout.cursorTo(0);
				process.stdout.write("Uploaded: " + files_uploaded + "/" + files_to_upload);

				if (files_uploaded === files_to_upload) {
					resolve(true);
				}
			});
		}

	});

	console.log("Uploading done with ",uploadId);
	process.exit(0);

}).catch(function(err){
	console.log(err);
	process.exit(0);
});
