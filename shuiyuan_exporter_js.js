// ==UserScript==
// @name         Shuiyuan Exporter JS
// @namespace    http://tampermonkey.net/
// @version      2024-10-08
// @description  try to take over the world!
// @author       SusieGlitter
// @match        https://shuiyuan.sjtu.edu.cn/
// @match        https://shuiyuan.sjtu.edu.cn/*
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
        try {
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
        } catch (e) {
            console.log(e)
            console.log('request failed')
            return null
        }
    }

    async function fetchAll(res, folder, maxRetryTimes) {
        let newres = []
        let suc = []
        for await (let result of asyncPool(10, res, async (item) => {
            let url = item[0]
            let filename = item[1]
            let retryTimes = item[2]
            let response = await make_request_get(url, false)
            if (response && (response.ok)) {

                console.log(response.url)
                // https://shuiyuan.s3.jcloud.sjtu.edu.cn/original/xxx/xxx/xxx/xxx/realFilename?xxxx
                let realFilename = response.url.match(/[^\/]+\?/g)[0].slice(0, -1)
                console.log(realFilename)

                let blob = await response.blob()
                await folder.folder("files").file(realFilename, blob)

                return [url, filename, maxRetryTimes, realFilename]
            } else {
                return [url, filename, retryTimes + 1, '']
            }
        })) {
            if (result[2] < maxRetryTimes) {
                newres.push(result)
                console.log(result[1] + ' failed')
                console.log(result[2])
            }
            else {
                console.log(result[1] + ' done')
                suc.push(result)
            }
        }
        console.log(newres.length + ' failed')
        return [newres, suc]
    }

    async function fileDownload(fileList, folder, maxRetryTimes = 3) {
        let res = fileList
        let suc = []
        let ret = []
        let resandsuc = []
        while (res.length != 0) {
            resandsuc = await fetchAll(res, folder, maxRetryTimes)
            res = resandsuc[0]
            suc = resandsuc[1]
            ret = ret.concat(suc)
            console.log('-------------')
            console.log(res)
            console.log(suc)
            console.log('-------------')
        }
        return ret
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
        console.log(text)
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

    async function fileDealing(text, folder) {
        let fileList = []
        function replacer(shortFilename) {
            console.log(shortFilename)
            let filename = shortFilename.match(/upload:\/\/[^\)]*\)/g)[0].slice(9, -1)
            let url = 'https://shuiyuan.sjtu.edu.cn/uploads/short-url/' + filename
            let replaceText = '[' + filename + '](./files/' + filename + ')'
            console.log(filename)
            fileList.push([url, filename, 0, ''])
            return replaceText
        }
        if (text.match(/\[[^\]]*\]\(upload:\/\/[^\)]*\)/g)) {
            text = text.replace(/\[[^\]]*\]\(upload:\/\/[^\)]*\)/g, replacer)

            fileList = await fileDownload(fileList, folder)
            console.log(fileList)

            for (let i = 0; i < fileList.length; i++) {
                let originalText = '[' + fileList[i][1] + '](./files/' + fileList[i][1] + ')'
                let replaceText = '[' + fileList[i][1] + '](./files/' + fileList[i][3] + ')'
                if (fileList[i][3] == '') {
                    replaceText = '```文件' + fileList[i][0] + '下载失败```'
                }
                text = text.replace(originalText, replaceText)
            }
        }
        return text
    }

    // 主函数
    async function main() {
        let zip = new JSZip()

        let topicID = await getTopicID()
        let filename = await getFilename()
        let text = await getRawText(topicID)

        await zip.folder(topicID)
        await zip.folder(topicID).folder("files")

        text = await fileDealing(text, zip.folder(topicID))

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
        let numList = []
        let a = 'How I want a drink, alcoholic of course, after the heavy lectures involving quantum mechanics'
        let num = a.replace(/\w+/g, (aaa) => {
            numList.push(aaa.length)
            return aaa.length
        })
        console.log(num)
        console.log(numList)
    }

})();