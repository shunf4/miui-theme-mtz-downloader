const express = require("express");
const request = require("request");
const cheerio = require("cheerio");
const url = require("url");
const fs = require("fs");
const querystring = require("querystring");

var config;

function loadConfig() {
    config = JSON.parse(fs.readFileSync('./config.json').toString());
}

function saveConfig() {
    fs.writeFileSync("./config.json", JSON.stringify(config));
}

loadConfig();

const HOST = "zhuti.xiaomi.com";

const UIVersion = {
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

const Cookie = {
    get "capability_465983348"() {
        return `paySupport|newPushSupport|uiVersion=${UIVersion[config.MIUIVersion]}|`;
    },
    isShowLoginTip: true,
    uiLocale: "zh_CN",
    get uiversion (){return UIVersion[config.MIUIVersion]}
};

function convertObject2CookieStr(cookie) {
    var result = "";
    for (var k in cookie) {
        result += `${k}=${cookie[k]}; `;
    }
    return result;
}

function createZhutiRequest(
    pathWithQuery,
    path,
    userAgent,
    callback,
    errorCallback
) {
    
    const options = {
        url: `http://${HOST}${pathWithQuery}`,
        method: 'GET',
        headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7,ja;q=0.6,ja-JP;q=0.5",
            "Cache-Control": "max-age=0",
            "Proxy-Connection": "keep-alive",
            "Upgrade-Insecure-Requests": 1,
            Host: HOST,
            Cookie: convertObject2CookieStr(Cookie),
            "User-Agent": userAgent
        },
    };

    console.log("\n[Request]", options);

    request(options, function(error, res, body) {
        if (error) {
            console.error(error);
            errorCallback(error);
        } else {
            var $ = cheerio.load(body);
            $(".bd>.uiversion").remove();
            if ($(".theme-nav>.bd")) {
                for (var miuiVersion in UIVersion) {
                    var queryParam = querystring.parse(url.parse(pathWithQuery).query);
                    queryParam.v = miuiVersion;

                    $(".theme-nav>.bd").append(`<a ${config.MIUIVersion == miuiVersion ? 'style="font-weight:bold;"' : ''} class=".uiversion" href="${path}?${querystring.stringify(queryParam)}">${miuiVersion}</a>`);
                }
            }

            if ($(".mod-action")) {
                $(".mod-action").prepend(`<button type="button" style="display: inline-block;background: url(http://resource.xiaomi.net/miuimarket/btn_push1.png) 0 -40px no-repeat;width: 136px;height: 36px;line-height: 36px;text-align: center;margin-right: 20px;color: #fff;border: none;cursor: pointer;float: left;" onclick="javascript:location.href='/getDownloadUrl${path}'">下载</button>`);
            }
            callback($.html());
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
        url: `http://thm.market.xiaomi.com/thm/download/v2/${path.replace(/.*\/detail\//g, "")}?capability=v%3a${UIVersion[config.MIUIVersion]}%2cvw&miuiUIVersion=${MIUICode[config.MIUIVersion]}`,
        method: 'GET',
        followRedirect: true,
        timeout: 3000,
        headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7,ja;q=0.6,ja-JP;q=0.5",
            Cookie: convertObject2CookieStr(Cookie),
            "User-Agent": userAgent
        },
    };

    console.log("\n[Request Download]", options);

    request(options, function(error, res, body) {
        if (error) {
            console.error(error);
            errorCallback(error);
        } else {
            var parsed;
            try {
                parsed = JSON.parse(body);
            } catch (e) {
                console.error("Response invalid:", body);
                errorCallback("Response invalid: " + body);
                return;
            }

            if (!('apiData' in parsed) || !('downloadUrl' in parsed.apiData)){
                console.error("Response invalid:", body);
                errorCallback("Response invalid: " + body);
            } else {
                console.log(body);
                callback(parsed.apiData.downloadUrl);
            }
        }
    });
}

const app = express();

app.get(/^(?!\/?getDownloadUrl).+$/, function(req, res, next) {
    res.header("Content-Type", "text/html; charset=utf-8");
    if (typeof req.query.v != undefined && req.query.v in UIVersion) {
        config.MIUIVersion = req.query.v;
        saveConfig();
    }

    createZhutiRequest(
        req.url,
        req.path,
        req.header("User-Agent"),
        function(body) {
            res.send(body);
        },
        function (error) {
            res.status(502).send(error.toString());
        }
    );
});

app.get("/getDownloadUrl/detail/*", function(req, res, next) {
    generateDownload(req.url, req.header("User-Agent"), function(url) {
        res.redirect(302, url);
    }, function (err) {
        res.status(500).send("Error:" + err.toString());
    });
});

app.use(function (req, res) {
    req.status(404).send("Not Found");
});

const port = 4000;

var server = app.listen(port, () => console.log(`Theme server running at ${server.address().address}:${server.address().port}`));
