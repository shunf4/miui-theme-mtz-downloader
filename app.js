const express = require("express");
const request = require("request");
const cheerio = require("cheerio");
const url = require("url");
const fs = require("fs");
const querystring = require("querystring");
const caseless = require("caseless");
var cookieParser = require('cookie-parser');

var config;

function loadConfig() {
    config = JSON.parse(fs.readFileSync('./config.json').toString());
}

function saveConfig() {
    fs.writeFileSync("./config.json", JSON.stringify(config));
}

loadConfig();

const D_HOST = "zhuti.xiaomi.com";
const M_HOST = "m.zhuti.xiaomi.com";

const UIVersion = {
    "MIUI4": 1,
    "MIUI5": 2,
    "MIUI6/7": 3,
    "MIUI8/9": 5,
    "MIUI10": 7
};

const DownloadUIVersion = {
    "MIUI4": 1,
    "MIUI5": 2,
    "MIUI6/7": 3,
    "MIUI8/9": 5,
    "MIUI10": 8
};

const MIUICode = {
    "MIUI4": "V4",
    "MIUI5": "V5",
    "MIUI6/7": "V6",
    "MIUI8/9": "V8",
    "MIUI10": "V10"
};

var MIUIVersion;

const Cookie = {
    get "capability_465983348"() {
        return `paySupport|newPushSupport|uiVersion=${UIVersion[MIUIVersion]}|`;
    },
    isShowLoginTip: true,
    uiLocale: "zh_CN",
    get uiversion (){return UIVersion[MIUIVersion]}
};

function convertObject2CookieStr(cookie) {
    var result = "";
    for (var k in cookie) {
        result += `${k}=${cookie[k]}; `;
    }
    return result;
}

function createZhutiRequest(
    req,
    HOST,
    callback,
    errorCallback
) {
    const options = {
        url: `http://${HOST}${req.url}`,
        method: req.method,
        headers: req.headers,
        body: req.body,
        encoding: "utf8",
        gzip: true
    };

    var cHeader = caseless(options.headers)
    cHeader.set({
        Host: HOST,
        Cookie: convertObject2CookieStr(Cookie),
    });
    options.headers = cHeader.dict;

    console.log("\n[Request]", options);

    request(options, function(err, res, body) {
        if (err) {
            console.error(err);
            errorCallback({code: 500, message: err.toString()});
        } else {
            if (res.caseless.get("Content-Type").toLowerCase().includes("html")) {
                var $ = cheerio.load(body);
                $(".bd>.uiversion").remove();
                if ($(".theme-nav>.bd")) {
                    for (var miuiVersion in UIVersion) {
                        var queryParam = querystring.parse(url.parse(req.url).query);
                        queryParam.v = miuiVersion;

                        $(".theme-nav>.bd").append(`<a ${MIUIVersion == miuiVersion ? 'style="font-weight:bold;"' : ''} class=".uiversion" href="${req.path}?${querystring.stringify(queryParam)}">${miuiVersion}</a>`);
                    }
                }

                if ($(".mod-action")) {
                    $(".mod-action").prepend(`<button type="button" style="display: inline-block;background: url(http://resource.xiaomi.net/miuimarket/btn_push1.png) 0 -40px no-repeat;width: 136px;height: 36px;line-height: 36px;text-align: center;margin-right: 20px;color: #fff;border: none;cursor: pointer;float: left;" onclick="javascript:location.href='/getDownloadUrl${req.path}'">下载</button>`);
                }

                if ($(".title-bar")) {
                    for (var miuiVersion in UIVersion) {
                        var queryParam = querystring.parse(url.parse(req.url).query);
                        queryParam.v = miuiVersion;

                        $(".title-bar").append(`<a  style="${MIUIVersion == miuiVersion ? 'font-weight:bold;' : ''}float:right;display:block;margin-left:1em;" href="${req.path}?${querystring.stringify(queryParam)}">${miuiVersion}</a>`);
                    }
                }

                if ($(".detailinfo")) {
                    $(".detailinfo").append(`<a href='/getDownloadUrl${req.path}' class='btn-use'>下载</a>`);
                }

                callback(res, $.html());
            } else {
                callback(res, body);
            }
        }
    });
}

function generateDownload(
    path,
    userAgent,
    callback,
    errorCallback
) {
    
    const options = {
        url: `http://thm.market.xiaomi.com/thm/download/v2/${path.replace(/.*\/detail\//g, "")}?capability=v%3a${DownloadUIVersion[MIUIVersion]}%2cvw&miuiUIVersion=${MIUICode[MIUIVersion]}`,
        method: 'GET',
        followRedirect: true,
        timeout: 3000,
        headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7,ja;q=0.6,ja-JP;q=0.5",
            Cookie: convertObject2CookieStr(Cookie),
            "User-Agent": userAgent
        },
        gzip: true
    };

    console.log("\n[Request Download]", options);

    request(options, function(err, res, body) {
        if (err) {
            console.error(err);
            errorCallback({code: 500, message: err.toString()});
        } else {
            var parsed;
            try {
                parsed = JSON.parse(body);
            } catch (e) {
                console.error("Response invalid:", body);
                errorCallback({code: 500, message: "Response unparsable: " + body});
                return;
            }

            if (!('apiData' in parsed) || !('downloadUrl' in parsed.apiData)){
                console.error("Response invalid:", body);
                errorCallback({code: 500, message: "Response invalid: " + body});
            } else {
                console.log(body);
                callback(res, parsed.apiData.downloadUrl);
            }
        }
    });
}

function getZhutiPageWrapper(HOST) {
    function getZhutiPage(req, res, next) {
        res.header("Content-Type", "text/html; charset=utf-8");
        MIUIVersion = req.cookies['MIUIVersion'];
        var miuiVersionSet = false;
        if (typeof MIUIVersion == 'undefined') {
            MIUIVersion = Object.keys(UIVersion)[Object.keys(UIVersion).length - 1];
            res.cookie("MIUIVersion", MIUIVersion);
            miuiVersionSet = true;
        }
        if (typeof req.query.v != undefined && req.query.v in UIVersion) {
            MIUIVersion = req.query.v;
            res.cookie("MIUIVersion", MIUIVersion);
            miuiVersionSet = true;
        }

        createZhutiRequest(
            req,
            HOST,
            function(pres, body) {
                res.set(pres.headers);
                res.set("content-encoding", "identity");
                res.set("transfer-encoding", "identity");
                res.set("content-length", "");
                res.set("set-cookie", "");
                if (miuiVersionSet) {
                    res.cookie("MIUIVersion", MIUIVersion);
                }
                res.send(body);
            },
            function (err) {
                res.status(err.code).send(err.message);
            }
        );
    }
    return getZhutiPage;
}

var getDownloadUrlHandler = function(req, res, next) {
    generateDownload(req.url, req.header("User-Agent"), function(pres, url) {
        res.redirect(302, url);
    }, function (err) {
        res.status(err.code).send(err.message);
    });
}

var return404 = function (req, res) {
    req.status(404).send("Not Found");
}

const app_desktop = express();
app_desktop.use(cookieParser());

app_desktop.get(/^(?!\/?getDownloadUrl).+$/, getZhutiPageWrapper(D_HOST));

app_desktop.get("/getDownloadUrl/detail/*", getDownloadUrlHandler);

app_desktop.use(return404);

const port_desktop = 4000;

var server_desktop = app_desktop.listen(port_desktop, () => console.log(`Theme server(desktop) running at ${server_desktop.address().address}:${server_desktop.address().port}`));

const app_mobile = express();
app_mobile.use(cookieParser());

app_mobile.get(/^(?!\/?getDownloadUrl).+$/, getZhutiPageWrapper(M_HOST));

app_mobile.get("/getDownloadUrl/detail/*", getDownloadUrlHandler);

app_mobile.use(return404);

const port_mobile = 4001;
var server_mobile = app_mobile.listen(port_mobile, () => console.log(`Theme server(mobile) running at ${server_mobile.address().address}:${server_mobile.address().port}`));
