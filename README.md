<img src="http://awsmedia.s3.amazonaws.com/AWS_Logo_PoweredBy_127px.png" alt="Powered by Amazon Web Services" align="right">

# LambdaBlogPlatform
## serverless blogging platform built with AWS

## Table of Contents
 * [About](#about)
 * [Installation prerequisites](#prerequisites)
 * [Installation](#installation)

## <a name="about"></a>About
 ![alt tag](https://s3-us-west-2.amazonaws.com/s-media.si/static/img/LBP_perspective_UI.jpg)
AWS Lambda Blog Platform is a complete blogging solution that uses the following Amazon Web Services for operation
 * API Gateway
 * Lambda
 * DynamoDB
 * S3
 * Cloudfront
 * SES

It runs completely serverless - free of any inflexible hardware infrastructure. The whole system running as a team of small misroservices means that the running expenses are without any overhead even at the smallest scale.

## <a name="prerequisites"></a>Installation prerequisites
* Have an AWS account
* Have your domain/subdomain set up in Route53
* make sure you can receive email on one of the following adressees for the approval of ssl certificate generation
 * administrator@domain.com
 * hostmaster@domain.com
 * postmaster@domain.com
 * webmaster@domain.com
 * admin@domain.com
* request a new certificate in AWS ACM (https://console.aws.amazon.com/acm/home?region=us-east-1#/) (HAS TO BE ISSUED IN __us-east-1__ REGION!!!)
 * if you are using just the domain - certificate name should be domain.com
 * if you are using subdomain - certificate name should be subdomain.domain.com or *.domain.com

## <a name="installation"></a>Installation
* download this repo, unzip and cd to project folder
* run ```npm install```
* Create a new user in IAM
 * [IAM -> Users -> Add User -> Access type -> check Programmatic access]
 * On the last step click on "Download .csv file" and save the file in project folder
* Add permissions to the user
 * [IAM -> Users -> your_user -> Permissions -> Add inline policy -> Custom policy]
 * Copy the following JSON and give your inline policy a name

 ```json
    {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "Stmt1481118325000",
                "Effect": "Allow",
                "Action": [
                    "iam:CreatePolicy",
                    "iam:CreateRole",
                    "iam:GetPolicy",
                    "iam:GetRole",
                    "iam:AttachUserPolicy",
                    "iam:AttachRolePolicy",
                    "iam:PassRole",
                    "route53:ListHostedZones",
                    "acm:ListCertificates",
                    "iam:ListUserPolicies",
                    "iam:GetUserPolicy"
                ],
                "Resource": [
                    "*"
                ]
            }
        ]
    }
```
* (install script will add other permisions that are necessary for installation)
* run ```node install.js```
* wizard will take you through the process of installation
* if everything went smooth you should see your page after CloudFront changes resolve (usually takes around 15 minutes)
