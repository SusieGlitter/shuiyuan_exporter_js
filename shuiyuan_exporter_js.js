// ==UserScript==
// @name         New Userscript
// @namespace    http://tampermonkey.net/
// @version      2024-10-08
// @description  try to take over the world!
// @author       SusieGlitter
// @match        https://shuiyuan.sjtu.edu.cn/t/topic/*
// @match        https://shuiyuan.sjtu.edu.cn/t/topic/*/*
// @require      https://cdn.bootcdn.net/ajax/libs/jszip/3.7.1/jszip.min.js
// @require      https://cdn.bootcdn.net/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @icon         data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==
// ==/UserScript==
/*global ajaxHooker*/
(function () {
    'use strict';

    // 异步相关 暂时没用上
    // async function* asyncPool(concurrency, iterable, iteratorFn) {
    //     const executing = new Set();
    //     async function consume() {
    //         const [promise, value] = await Promise.race(executing);
    //         executing.delete(promise);
    //         return value;
    //     }
    //     for (const item of iterable) {
    //         const promise = (async () => await iteratorFn(item, iterable))().then(
    //             value => [promise, value]
    //         );
    //         executing.add(promise);
    //         if (executing.size >= concurrency) {
    //             yield await consume();
    //         }
    //     }
    //     while (executing.size) {
    //         yield await consume();
    //     }
    // }

    // 网络请求相关
    function urlWithParams(url, params) {
        let newUrl = url
        if (params.length == 0) {
            return newUrl
        }
        let i = 0
        Object.entries(params).forEach(([key, value]) => {
            if (i == 0) {
                newUrl += encodeURI(`?${key}=${value}`)
            } else {
                newUrl += encodeURI(`&${key}=${value}`)
            }
            i++
        })
        return newUrl

    }
    async function make_request_get(url, xmlh = true) {
        let response = await fetch(url, {
            method: "GET",
            headers: xmlh ? {
                "User-Agent": navigator.userAgent,
                "Cookie": document.cookie,
                "X-Requested-With": "XMLHttpRequest"
            } : {
                "User-Agent": navigator.userAgent,
                "Cookie": document.cookie,
            }
        })
        return response
    }

    // 获取信息相关
    async function getUrl() {
        let url = window.location.href
        url = url.match(/https:\/\/shuiyuan.sjtu.edu.cn\/t\/topic\/[^\/.]+/g)[0]
        return url
    }

    async function getTopicID() {
        let url = await getUrl()
        let topicID = url.match(/\d+/g)[0]
        return topicID
    }

    async function getFilename() {
        let url = await getUrl()
        let topicID = await getTopicID()
        let oneboxUrl = urlWithParams('https://shuiyuan.sjtu.edu.cn/onebox', { url: url })
        let res = await make_request_get(oneboxUrl)
        let parser = new DOMParser()
        let text = await res.text()
        let doc = parser.parseFromString(text, 'text/html')
        let filename = doc.querySelector('a').textContent
        // console.log(filename)
        filename = filename + ".md"
        filename = filename.replace("/", " or ")
        filename = filename.replace(/<[^>]+>/g, "_")
        filename = topicID + " " + filename
        return filename
    }

    // 文本获取与处理
    async function getRawText(topicID) {
        let text = ''
        for (let i = 1; ; i++) {
            let url_raw = urlWithParams('https://shuiyuan.sjtu.edu.cn/raw/' + topicID, { page: i })
            let res_raw = await make_request_get(url_raw)
            let subtext = await res_raw.text()
            if (subtext == '') {
                break
            } else {
                text += subtext
            }
        }
        return text
    }

    // 主函数
    async function main() {
        let zip = new JSZip()
        await zip.folder(topicID)
        await zip.folder(topicID).folder("img")


        let topicID = await getTopicID()
        let filename = await getFilename()
        let text = await getRawText(topicID)

        // TODO 文件替换
        // 咕咕咕

        // console.log(text)
        await zip.folder(topicID).file(filename, text)

        zip.generateAsync({ type: "blob" })
            .then(function (content) {
                saveAs(content, topicID + ".zip")
                console.log("done")
            })


    }

    // 脚本启动
    window.onload = function () {
        let buttonMain = document.createElement('button')
        buttonMain.innerHTML = "下载"
        buttonMain.style.color = "black"
        let div1 = document.getElementsByClassName('panel')[0]
        div1.insertBefore(buttonMain, div1.firstChild)
        buttonMain.onclick = main

        let buttonTest = document.createElement('button')
        buttonTest.innerHTML = "测试"
        buttonTest.style.color = "black"
        let div2 = document.getElementsByClassName('panel')[0]
        div2.insertBefore(buttonTest, div2.firstChild)
        buttonTest.onclick = test
    }

    // 测试函数
    async function test() {
        // 按照函数规则替换字符串 好文明
        let numList=[]
        let a = 'How I want a drink, alcoholic of course, after the heavy lectures involving quantum mechanics'
        let num = a.replace(/\w+/g, (aaa) => {
            numList.push(aaa.length)
            return aaa.length 
        })
        console.log(num)
        console.log(numList)
    }

})();