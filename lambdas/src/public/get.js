// get

var co = require('co');
var https = require('https');
var doT = require('dot');
var moment = require('moment');
var _ = require('lodash');

var AWS = require('aws-sdk');
var docClient = new AWS.DynamoDB.DocumentClient();
var s3 = new AWS.S3();

var dynamoObjects = require('../../lib/dynamoObjects.js');

var get_templates = function(template){
    return {
        main_template: require('html!../../templates/'+template+'/main.html'),
        header: require('html!../../templates/'+template+'/header.html'),
        footer: require('html!../../templates/'+template+'/footer.html'),
        template: require('html!../../templates/'+template+'/posts.html')
    } 
}

exports.handler = (event, context, callback) => {
    var site_base_url = event.site_base_url;

    var articles_bucket_path = event.articles_bucket_path;
    var posts_table = event.posts_table;
    var objects_table = event.objects_table;

    var template = event.template;

    var templates = get_templates(template);

    if(event.pathParams && event.pathParams['page']){
        var page = parseInt(event.pathParams['page']) || 0;
    }else{
        var page = 0;
    }
    

    co(function *(){
        var categories_object = yield dynamoObjects(objects_table, 'categories');
        var categories = categories_object.object;
        var settings_object = yield dynamoObjects(objects_table, 'settings');
        var settings = settings_object.object;

        var posts = yield getBlogPostsFromDB();
        var recent_posts = _.clone(posts);

        var posts_html = [];
        var j = 0;

        for(var i = page*settings.no_posts_per_page; i < (page + 1)*settings.no_posts_per_page; i++){
            if(posts[i]){
                var lim = settings.post_char_count || 300
                posts_html.push(getBlogPostHtml(posts[i].post_id, lim));
                posts[i].html = j;
                j++;               
            }
        }

        var resolved_posts_html = yield posts_html;

        for(var i = 0; i < categories.length; i++){
            if(!_.find(posts, function(post){return _.includes(post.categories, categories[i].category_id)})){
                categories.splice(i, 1);
                i--;
            }
        }

        var html = doT.template(templates.main_template)({
            header: doT.template(templates.header)({
                website_title: settings.website_title,
                header_title: settings.header_title,
                header_desc: settings.header_desc,
                
                site_base_url: site_base_url,
                categories: categories,
                template_settings: settings.template,
                recent_posts: recent_posts,
                page: page,
                last_page: Math.ceil(posts.length / settings.no_posts_per_page)-1
            }),
            content: doT.template(templates.template)({
                site_base_url: site_base_url,
                moment: moment,
                categories: categories,
                posts: posts,
                recent_posts: recent_posts,
                posts_html: resolved_posts_html,
                page: page,
                no_posts_per_page: settings.no_posts_per_page,
                last_page: Math.ceil(posts.length / settings.no_posts_per_page)-1
            }),
            footer: doT.template(templates.footer)({
                site_base_url: site_base_url
            }),
        });

        callback(null, html);
    }).catch(onerror);

    function getBlogPostsFromDB(){
        return new Promise(function(resolve, reject){
            var params = { 
                TableName: posts_table,
                IndexName: "post_status-date-index",
                KeyConditionExpression: "post_status = :post_status AND #date > :date",
                
                ExpressionAttributeNames: {"#date": "date"},

                ExpressionAttributeValues: {
                    ":post_status": "published",
                    ":date": 0
                },
                ScanIndexForward: false
            };

            docClient.query(params, function(err, data) {
                if (err){
                    reject(err);
                }else{
                    resolve(data.Items);
                }
            });
        })
    }

    function trimHtml(html, options) {

        options = options || {};

        var limit = options.limit || 100,
            preserveTags = (typeof options.preserveTags !== 'undefined') ? options.preserveTags : true,
            wordBreak = (typeof options.wordBreak !== 'undefined') ? options.wordBreak : false,
            suffix = options.suffix || '...',
            moreLink = options.moreLink || '';

        var arr = html.replace(/</g, "\n<")
            .replace(/>/g, ">\n")
            .replace(/\n\n/g, "\n")
            .replace(/^\n/g, "")
            .replace(/\n$/g, "")
            .split("\n");

        var sum = 0,
            row, cut, add,
            tagMatch,
            tagName,
            tagStack = [],
            more = false;

        for (var i = 0; i < arr.length; i++) {

            row = arr[i];
            // count multiple spaces as one character
            var rowCut = row.replace(/[ ]+/g, ' ');

            if (!row.length) {
                continue;
            }

            if (row[0] !== "<") {

                if (sum >= limit) {
                    row = "";
                } else if ((sum + rowCut.length) >= limit) {

                    cut = limit - sum;

                    if (row[cut - 1] === ' ') {
                        while(cut){
                            cut -= 1;
                            if(row[cut - 1] !== ' '){
                                break;
                            }
                        }
                    } else {

                        add = row.substring(cut).split('').indexOf(' ');

                        // break on halh of word
                        if(!wordBreak) {
                            if (add !== -1) {
                                cut += add;
                            } else {
                                cut = row.length;
                            }
                        }
                    }

                    row = row.substring(0, cut) + suffix;

                    if (moreLink) {
                        row += '<a href="' + moreLink + '" style="display:inline">»</a>';
                    }

                    sum = limit;
                    more = true;
                } else {
                    sum += rowCut.length;
                }
            } else if (!preserveTags) {
                row = '';
            } else if (sum >= limit) {

                tagMatch = row.match(/[a-zA-Z]+/);
                tagName = tagMatch ? tagMatch[0] : '';

                if (tagName) {
                    if (row.substring(0, 2) !== '</') {

                        tagStack.push(tagName);
                        row = '';
                    } else {

                        while (tagStack[tagStack.length - 1] !== tagName && tagStack.length) {
                            tagStack.pop();
                        }

                        if (tagStack.length) {
                            row = '';
                        }

                        tagStack.pop();
                    }
                } else {
                    row = '';
                }
            }

            arr[i] = row;
        }

        return {
            html: arr.join("\n").replace(/\n/g, ""),
            more: more
        };
    }

    function getBlogPostHtml(post_id, limit){
        return new Promise(function(resolve, reject){
            console.log(site_base_url+"/"+articles_bucket_path+"/"+post_id+"/index.html");
            https.get(site_base_url+"/"+articles_bucket_path+"/"+post_id+"/index.html", (response) => {
                var body = [];
                response.on('data', function(chunk) {
                  body.push(chunk);
                }).on('end', function() {
                    body = Buffer.concat(body).toString('utf8');
                    var trunc = trimHtml(body,{limit:limit})
                    resolve(trunc.html);
                }).on('error', function(err) {
                    reject(err);
                });
            }).on('error', (e) => {
              console.log(`Got error: ${e.message}`);
            });
        });
    }

    function onerror(err) {
        console.log("ERROR!");
        console.log(err);
        console.log(arguments);
        callback(err.message);
    }
}