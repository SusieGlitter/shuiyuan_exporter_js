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

    // 异步相关
    async function* asyncPool(concurrency, iterable, iteratorFn) {
        const executing = new Set();
        async function consume() {
            const [promise, value] = await Promise.race(executing);
            executing.delete(promise);
            return value;
        }
        for (const item of iterable) {
            const promise = (async () => await iteratorFn(item, iterable))().then(
                value => [promise, value]
            );
            executing.add(promise);
            if (executing.size >= concurrency) {
                yield await consume();
            }
        }
        while (executing.size) {
            yield await consume();
        }
    }

    // 网络请求相关
    async function make_request(url) {
        let response = await fetch(url, {
            method: "GET",
            headers: {
                "User-Agent": navigator.userAgent,
                "Cookie": document.cookie,
                "X-Requested-With": "XMLHttpRequest"
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
        let topicID = await getTopicID()
        let oneboxUrl = 'https://shuiyuan.sjtu.edu.cn/onebox?url=https%3A%2F%2Fshuiyuan.sjtu.edu.cn%2Ft%2Ftopic%2F' + topicID
        let res = await make_request(oneboxUrl)
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

    // 文件相关
    let zip = new JSZip()

    // 主函数
    async function main() {
        let topicID = await getTopicID()
        let filename = await getFilename()
        let text = ''
        for (let i = 1; i <= 101; i++) {
            let url_raw = 'https://shuiyuan.sjtu.edu.cn/raw/' + topicID + '?page=' + i
            let res_raw = await make_request(url_raw)
            let subtext = await res_raw.text()
            if (subtext == '') {
                break
            }else{
                text += subtext
            }
        }
        console.log(text)
        await zip.folder(topicID)
        await zip.folder(topicID).file(filename, text)
        console.log(zip)
        zip.generateAsync({ type: "blob" })
            .then(function (content) {
                saveAs(content, topicID + ".zip")
                console.log("done")
            })
    }
    window.onload = function () {
        let button = document.createElement('button')
        button.innerHTML = "下载"
        button.style.color = "black"
        let div = document.getElementsByClassName('panel')[0]
        div.insertBefore(button, div.firstChild)
        button.onclick = main
    }

})();