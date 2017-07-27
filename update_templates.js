var co = require("co");
var path = require("path");
var fs = require("fs");
var node_s3_client = require('s3');

var isThere = require("is-there");
var chalk = require('chalk');
var _ = require('lodash');

var webpack = require("webpack");
var pass_generator = require('generate-password');
var MemoryFS = require("memory-fs");
var uuid = require('uuid');

var zip = require("node-zip");

var config = require('./install/lambda_config.json');
var lambda_api_mappings = require('./install/install_Lambda_API_Gateway_mappings.json');
var api_gateway_definitions = require('./install/install_API_Gateway_definitions.json');

var AWS = require('aws-sdk');
AWS.config.loadFromPath(config.credentials_path);

var iam = new AWS.IAM({apiVersion: '2010-05-08'});
var lambda = new AWS.Lambda({apiVersion: '2015-03-31'});
var apigateway = new AWS.APIGateway({apiVersion: '2015-07-09'});
console.log();
console.log(chalk.cyan("Updating Lambda functions"));

function getFiles(srcpath) {
  return fs.readdirSync(srcpath).filter(function(file) {
    return !fs.statSync(path.join(srcpath, file)).isDirectory();
  });
}

function getEntries(){
  var public_files = getFiles(path.join(__dirname, "./lambdas/src/public"))
    .filter(obj => {
    	return _.includes(["about.js", "contact.js", "get.js", "get_post.js", "get_posts_by_category.js"], obj);
    }).map(filename => {
	       return {
	       	name: filename,
	       	path: path.join(
		         path.join(__dirname, "./lambdas/src/public"),
		         filename
		    )
	       };
     })
  return public_files;
}

function getAllEntries() {
        var public_files = getFiles(path.join(__dirname, "./lambdas/src/public"))
            .map(filename => {
                return {
                    name: filename,
                    path: path.join(
                        path.join(__dirname, "./lambdas/src/public"),
                        filename
                    )
                };
            })

        var admin_files = getFiles(path.join(__dirname, "./lambdas/src/admin"))
            .map(filename => {
                return {
                    name: filename,
                    path: path.join(
                        path.join(__dirname, "./lambdas/src/admin"),
                        filename
                    )
                };
            })
        return public_files.concat(admin_files);
    }


var entries = getAllEntries();

co(function*(){
	console.log();
	console.log(chalk.cyan("creating IAM role"));

	var role_arn = yield new Promise(function(resolve, reject){	
		iam.createRole({
		  AssumeRolePolicyDocument: JSON.stringify({
			   "Version" : "2012-10-17",
			   "Statement": [ {
			      "Effect": "Allow",
			      "Principal": {
			         "Service": [ "lambda.amazonaws.com" ]
			      },
			      "Action": [ "sts:AssumeRole" ]
			   } ]
			}),
		  RoleName: config.role_name, /* required */
		}, function(err, data) {
		  if (err){
		  	if(err.code = "EntityAlreadyExists"){
		  		console.log(chalk.yellow(err));
				iam.getRole({
				  RoleName: config.role_name
				}, function(err, data) {
				  if (err) {
				  	console.log(chalk.red(err));
			  		console.log(err.stack);
			  		reject();
				  }else{
				  	resolve(data.Role.Arn);
				  }
				});
		  	}else{
		  		console.log(chalk.red(err));
		  		console.log(err.stack);
		  		reject();
		  	}
		  }else{
		  	resolve(data.Role.Arn);
		  }
		});
	});

	for(var i = 0; i < entries.length; i++){
		yield new Promise(function(resolve, reject){
			var array = fs.readFileSync(entries[i].path).toString().split("\n");
			var first_line = array[0];
			var fn_name_without_prefix = first_line.substring(3).trim();
			var lambda_fn_name = config.lambda_prefix+"_"+fn_name_without_prefix;

			console.log("Creating lambda function: " + chalk.green(lambda_fn_name));

			var mfs = new MemoryFS();
			var compiler = webpack({
			      entry: entries[i].path, 
				  output: {
				    path: __dirname,
				    libraryTarget: "commonjs2",
				    filename: "compiled.js"
				  },
				  externals: {
				    "aws-sdk": "aws-sdk"
				  },
				  target: "node",
				  
				  module: {
				    loaders: [{
				        test: /\.json$/,
				        loader: 'json'
				      }]
				  },
				  
			}, function(err, stats) {
			    if (err){
				  	console.log(chalk.red(err));
				  	console.log(err);
				  }
			});
			compiler.outputFileSystem = mfs;

			compiler.run(function(err, stats) { 
				var zip = new JSZip();

				zip.file(entries[i].name, mfs.readFileSync(__dirname+"/"+"compiled.js"));
				var zip_data = zip.generate({type:"uint8array", compression: 'deflate'});

			  	var params = {
				  Code: {
				    ZipFile: zip_data
				  },
				  FunctionName: lambda_fn_name,
				  Handler: path.basename(entries[i].name, '.js')+".handler",
				  Role: role_arn,
				  Runtime: "nodejs4.3",
				  //Description: 'STRING_VALUE',
				  MemorySize: 512,
				  Publish: true,
				  Timeout: 10
				};

				lambda.createFunction(params, function(err, data) {
				  if (err){
				  	if(err.code == "ResourceConflictException"){
				  		console.log(chalk.yellow(err));
				  		lambda.getFunction({
						  FunctionName: lambda_fn_name
						}, function(err, data) {
						  if (err) {
						  	console.log(chalk.red(err));
					  		console.log(err.stack);
						  }else{
						  	var params = {
							  FunctionName: lambda_fn_name, // *required* /
							  Publish: true,
							  ZipFile: zip_data
							};
							lambda.updateFunctionCode(params, function(err, data) {
							  if (err){
							  	console.log(err, err.stack); // an error occurred
							  }else{
							  	console.log(data);           // successful response
							  	resolve();
							  }     
							});
						  }
						});
				  	}else{
				  		console.log(chalk.red(err));
				  		console.log(err.stack);
				  	}
				  }else{
					lambda.addPermission({
					  Action: 'lambda:*', // * required * //
					  FunctionName: lambda_fn_name, // * required * //
					  Principal: 'apigateway.amazonaws.com', // * required * //
					  StatementId: uuid.v4(), // * required * //
					}, function(err, data) {
					  if (err) {
					  	console.log(err, err.stack); // an error occurred
					  }else{
					  	console.log(data); 
				  		resolve();
					  }
					});
				  }
				});

			});
		});
	}

	api_gateway_definitions.info.title = config.api_gateway_name;

	for (var key in lambda_api_mappings) {
		if (lambda_api_mappings[key].resource.constructor === Array) {
			for (var i = 0; i < lambda_api_mappings[key].resource.length; i++) {
				if (api_gateway_definitions.paths[lambda_api_mappings[key].resource[i]].post) {
					api_gateway_definitions.paths[lambda_api_mappings[key].resource[i]].post["x-amazon-apigateway-integration"].uri = "arn:aws:apigateway:" + config.region + ":lambda:path/2015-03-31/functions/" + lambda_api_mappings[key].lambda_arn + "/invocations";
				}
				if (api_gateway_definitions.paths[lambda_api_mappings[key].resource[i]].get) {
					api_gateway_definitions.paths[lambda_api_mappings[key].resource[i]].get["x-amazon-apigateway-integration"].uri = "arn:aws:apigateway:" + config.region + ":lambda:path/2015-03-31/functions/" + lambda_api_mappings[key].lambda_arn + "/invocations";
				}
			}
		} else {
			if (api_gateway_definitions.paths[lambda_api_mappings[key].resource].post) {
				api_gateway_definitions.paths[lambda_api_mappings[key].resource].post["x-amazon-apigateway-integration"].uri = "arn:aws:apigateway:" + config.region + ":lambda:path/2015-03-31/functions/" + lambda_api_mappings[key].lambda_arn + "/invocations";
			}
			if (api_gateway_definitions.paths[lambda_api_mappings[key].resource].get) {
				api_gateway_definitions.paths[lambda_api_mappings[key].resource].get["x-amazon-apigateway-integration"].uri = "arn:aws:apigateway:" + config.region + ":lambda:path/2015-03-31/functions/" + lambda_api_mappings[key].lambda_arn + "/invocations";
			}
		}
	}


	var api_id = yield new Promise(function (resolve, reject) {
		apigateway.getRestApis({}, function (err, data) {
			if (err) {
				console.log(err, err.stack);
				reject();
			} else {
				console.log("API names",data)
				var found_api_gateway = _.find(data.items, {'name': config.api_gateway_name});
				if (found_api_gateway) {
					console.log();
					console.log(chalk.yellow("API Gateway with name: " + config.api_gateway_name + " already exists"));
					resolve(found_api_gateway.id);
				} else {
					apigateway.importRestApi({
						body: JSON.stringify(api_gateway_definitions),
						failOnWarnings: true,
					}, function (err, data) {
						if (err) {
							console.log(chalk.red(err));
							console.log(err.stack);
							reject();
						} else {
							console.log();
							console.log("API Gateway: " + chalk.green(config.api_gateway_name) + " was created");
							resolve(data.id);
						}
					});
				}
			}
		});
	});


	config.api_gateway_stage_variables.objects_table = config.table_prefix + "_objects";
	config.api_gateway_stage_variables.posts_table = config.table_prefix + "_posts";

	config.api_gateway_stage_variables.articles_bucket = config.bucket_name;

	config.api_gateway_stage_variables.signing_key = pass_generator.generate({
		length: 20,
		numbers: true,
		symbols: false,
		uppercase: true
	});

	var deployment_id = yield new Promise(function (resolve, reject) {
		var params = {
			restApiId: api_id,
			stageName: 'prod',
			cacheClusterEnabled: false,
			variables: config.api_gateway_stage_variables
		};
		apigateway.createDeployment(params, function (err, data) {
			if (err) {
				console.log(err, err.stack);
			} else {
				resolve(data.id);
			}

		});
	});


}).catch(function(err){
	console.log(err);
});
