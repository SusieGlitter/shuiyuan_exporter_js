// ==UserScript==
// @name         Shuiyuan Exporter JS
// @namespace    http://tampermonkey.net/
// @version      2026-05-21
// @description  导出水源社区帖子和附件为ZIP
// @author       SusieGlitter with Gemini
// @match        https://shuiyuan.sjtu.edu.cn/
// @match        https://shuiyuan.sjtu.edu.cn/*
// @match        https://shuiyuan.sjtu.edu.cn/t/topic/*
// @match        https://shuiyuan.sjtu.edu.cn/t/topic/*/*
// @require      https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js
// @require      https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @icon         data:image/gif;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAdWgAAHVgB8YlK3wAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXpeoruPBoAAAC+SURBVDiNtVLBjgNBDL332gOogGgAOkGzQDoQOgI6QToCekGzQToqg24o+2g2QZ0g6wS9R0b2zR3g3+l8vIubm8n8e3zJd55Vj0U673N9Q11v76p0x7Q+X569rK+q329S1/l4407B19777X9H+YgU3gXhD5JvB3F3x+vj73809/2N+d5Q+5wR0j3P9+17sQzU3g/oU/J+c9+3+f1j/s/tL1n7/A9eF7gD2V8y2127x34L97mB+796J+3W8y+7+8B/cT0j2L+T7r2wzQ3XgHhD5I2V4E7g/4f0j0H+pP4P+f0j7N+97gT2F/y3H2sV+5h/w/935C7A/iC9C/Bfg7/Ffgf4f9f7Q/c+8F/cD4D+D/g3v1G9/gEAAAABJRU5ErkJggg==
// ==/UserScript==
/*global ajaxHooker*/
(function () {
    'use strict';
    let cnt = 0
    let sum = 0
    let zipFiles = {} 

    // 进度条相关元素
    let progressContainer = null;
    let progressBar = null;
    let progressText = null;

    // 辅助函数
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // --- 进度条更新函数 ---
    function updateProgress(text, percent = -1) {
        if (!progressText || !progressBar) return;

        progressText.innerHTML = text;

        if (percent >= 0) {
            progressBar.style.width = `${Math.min(100, percent)}%`;
            progressBar.style.opacity = '1';
        } else {
            // 文本阶段（非精确进度），使用模糊进度
            progressBar.style.width = '100%'; 
            progressBar.style.opacity = '0.1'; 
        }
    }

    function resetProgress(parentWrapper) {
        // 如果已经存在，先移除
        if (progressContainer && progressContainer.parentNode) {
            progressContainer.parentNode.removeChild(progressContainer);
        }

        // 创建进度条容器 (悬浮于按钮下方)
        progressContainer = document.createElement('div');
        progressContainer.id = 'shuiyuan-exporter-progress-container';
        progressContainer.style.cssText = `
            position: absolute;
            top: calc(100% + 6px);
            left: 0;
            padding: 0;
            width: 360px; /* 缩小宽度，作为悬浮提示框 */
            height: 28px;
            background-color: #f5f5f5; /* 底色 */
            border: 1px solid #ccc;
            border-radius: 4px;
            overflow: hidden;
            box-sizing: border-box;
            display: block;
            z-index: 9999; /* 确保悬浮在页面内容之上 */
            box-shadow: 0 4px 12px rgba(0,0,0,0.25); /* 添加立体阴影 */
        `;

        // 创建图形进度条
        progressBar = document.createElement('span');
        progressBar.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            height: 100%;
            width: 0%;
            background-color: #4CAF50; /* 绿色进度条 */
            transition: width 0.3s ease-in-out, opacity 0.3s ease-in-out;
            z-index: 1;
            opacity: 0;
        `;

        // 创建文本显示区域
        progressText = document.createElement('span');
        progressText.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #333;
            font-weight: bold;
            font-size: 13px;
            text-shadow: 1px 1px 2px rgba(255, 255, 255, 0.7);
            z-index: 2;
            white-space: nowrap;
            width: 100%;
            text-align: center; /* 确保文本在较小的框内居中 */
        `;

        progressContainer.appendChild(progressBar);
        progressContainer.appendChild(progressText);

        // 插入到外层相对定位容器中
        parentWrapper.appendChild(progressContainer);

        updateProgress("正在初始化...");
    }
    // --- 进度条更新函数结束 ---


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
        if (Object.keys(params).length === 0) {
            return newUrl
        }
        let i = 0
        Object.entries(params).forEach(([key, value]) => {
            if (i === 0) {
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
            let headers = { "User-Agent": navigator.userAgent };
            if (xmlh) headers["X-Requested-With"] = "XMLHttpRequest";
            let response = await fetch(url, { method: "GET", headers: headers });
            return response;
        } catch (error) {
            console.error('Fetch Error:', error);
            return null;
        }
    }
    function gmRequestFile(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                responseType: "arraybuffer",
                headers: {
                    "User-Agent": navigator.userAgent,
                },
                anonymous: false,
                timeout: 30000,
                onload: function (resp) {
                    if (resp.status >= 200 && resp.status < 400) {
                        resolve({
                            finalUrl: resp.finalUrl || url,
                            data: new Uint8Array(resp.response)
                        });
                    } else {
                        reject(new Error(`Status ${resp.status}`));
                    }
                },
                onerror: reject,
                ontimeout: () => reject(new Error('timeout'))
            });
        });
    }

    async function fetchAll(res, maxRetryTimes) {
        let newres = [];
        let suc = [];
        let totalItems = sum;

        for await (let result of asyncPool(10, res, async (item) => {
            let url = item[0];
            let filename = item[1];
            let retryTimes = item[2];

            try {
                let resp = await gmRequestFile(url);
                cnt += 1;
                let percent = (cnt / totalItems) * 100;
                updateProgress(`文件下载中: ${cnt} / ${totalItems}`, percent);
                console.log(cnt, "/", sum);
                console.log(resp.finalUrl);

                let match = resp.finalUrl.match(/([^\/]+)\?/);
                let realFilename = match ? match[1] : filename;
                console.log(realFilename);

                zipFiles[`files/${realFilename}`] = resp.data;
                return [url, filename, maxRetryTimes, realFilename];

            } catch (err) {
                console.warn(`Download error: ${filename}, attempt ${retryTimes + 1}`, err);
                if (retryTimes + 1 <= maxRetryTimes) {
                    return [url, filename, retryTimes + 1, ''];
                } else {
                    return [url, filename, maxRetryTimes, ''];
                }
            }
        })) {
            if (result[2] < maxRetryTimes && result[3] === '') {
                newres.push(result);
            } else {
                suc.push(result);
            }
        }
        console.log(newres.length + ' failed / need retry');
        return [newres, suc];
    }

    async function fileDownload(fileList, maxRetryTimes = 5) {
        let res = fileList.map(item => [item[0], item[1], 0, ''])
        let suc = []
        let ret = []
        let attempt = 0
        const MAX_GLOBAL_ATTEMPTS = 10;

        while (res.length !== 0 && attempt < MAX_GLOBAL_ATTEMPTS) {
            attempt++;
            console.log(`\n--- Global File Download Attempt ${attempt} ---`);

            let resandsuc = await fetchAll(res, maxRetryTimes);
            res = resandsuc[0];
            suc = resandsuc[1].filter(item => item[3] !== '');

            ret = ret.concat(suc);

            if (res.length > 0) {
                const delay = 5000 * attempt;
                console.log(`${res.length} files still failed. Waiting for ${delay / 1000} seconds before next attempt.`);
                updateProgress(`文件下载失败 ${res.length} 个。等待 ${delay / 1000} 秒后重试...`);
                await sleep(delay);
            } else {
                console.log('All files downloaded successfully or max retries reached for failed items.');
            }
        }

        let finalRet = ret.concat(res.filter(item => item[3] === ''));
        return finalRet;
    }

    // 获取信息相关
    async function getUrl() {
        let url = window.location.href
        let match = url.match(/https:\/\/shuiyuan.sjtu.edu.cn\/t\/topic\/[^\/.]+/g)
        return match ? match[0] : null
    }

    async function getTopicID() {
        let url = await getUrl()
        if (!url) return null
        let topicID = url.match(/\d+/g)
        return topicID ? topicID[0] : null
    }

    async function getFilename() {
        let url = await getUrl()
        let topicID = await getTopicID()
        if (!url || !topicID) return topicID + " topic.md"

        let jsonUrl = url + ".json"
        let res = await make_request_get(jsonUrl, true)
        if (!res || !res.ok) {
            console.warn("Failed to fetch topic JSON. Using default filename.");
            return topicID + " topic.md"
        }

        try {
            let data = await res.json()
            let filename = data.fancy_title || data.title || "未知标题"

            filename = filename + ".md"
            filename = filename.replace(/\//g, " or ")
            filename = filename.replace(/<[^>]+>/g, "_")
            filename = topicID + " " + filename
            return filename
        } catch (err) {
            console.error("Parse JSON error in getFilename:", err);
            return topicID + " topic.md"
        }
    }

    async function getReplyRelations(topicID) {
        let replyMap = new Map();
        try {
            // 1. 先请求第一页，获取总帖数
            let firstPageUrl = `https://shuiyuan.sjtu.edu.cn/t/${topicID}.json?page=1`;
            updateProgress(`解析回复关系中... (第1页)`);
            let firstRes = await make_request_get(firstPageUrl, true);
            if (!firstRes || !firstRes.ok) {
                console.warn('请求第1页 JSON 失败，无法获取回复关系');
                return replyMap;
            }

            let firstData = await firstRes.json();
            let posts = firstData.post_stream?.posts;
            if (!posts || posts.length === 0) {
                return replyMap;
            }

            // 处理第一页的回复关系
            for (let post of posts) {
                if (post.reply_to_post_number) {
                    replyMap.set(post.post_number, post.reply_to_post_number);
                }
            }

            // 计算总页数
            const totalPosts = firstData.post_stream?.stream?.length || 0;
            const postsPerPage = posts.length;            // 通常为 20
            const totalPages = Math.ceil(totalPosts / postsPerPage);

            if (totalPages <= 1) {
                console.log("最终回复关系表:", replyMap);
                return replyMap;
            }

            // 2. 并发请求剩余页面（每批最多 3 页同时进行）
            let pageTasks = [];
            for (let page = 2; page <= totalPages; page++) {
                let url = `https://shuiyuan.sjtu.edu.cn/t/${topicID}.json?page=${page}`;
                pageTasks.push((async () => {
                    try {
                        let res = await make_request_get(url, true);
                        if (!res || !res.ok) return;
                        let data = await res.json();
                        let posts = data.post_stream?.posts;
                        if (!posts) return;
                        for (let post of posts) {
                            if (post.reply_to_post_number) {
                                replyMap.set(post.post_number, post.reply_to_post_number);
                            }
                        }
                    } catch (e) {
                        console.warn(`获取第${page}页 JSON 失败`, e);
                    }
                })());
            }

            // 分批执行并发请求
            const CONCURRENCY = 3;
            for (let i = 0; i < pageTasks.length; i += CONCURRENCY) {
                const batch = pageTasks.slice(i, i + CONCURRENCY);
                await Promise.all(batch);
                const donePages = Math.min(i + CONCURRENCY, totalPages);
                updateProgress(`解析回复关系中... (${donePages}/${totalPages} 页)`);
            }

            console.log("最终回复关系表:", replyMap);
            if (replyMap.size === 0) {
                updateProgress("未发现楼层间的回复关系。");
            }
        } catch (e) {
            console.error("解析回复关系时出错:", e);
        }
        return replyMap;
    }

    async function getRawText(topicID) {
        let text = ''
        let page = 1;
        const MAX_RETRIES = 5;

        updateProgress("文本下载中...");

        while (true) {
            let pageText = null;
            let retryCount = 0;

            while (retryCount < MAX_RETRIES) {
                let url_raw = urlWithParams('https://shuiyuan.sjtu.edu.cn/raw/' + topicID, { page: page });
                console.log(`Fetching raw page ${page}. Attempt: ${retryCount + 1}`);
                updateProgress(`文本下载中: 第 ${page} 页 (尝试 ${retryCount + 1})`);

                let res_raw = await make_request_get(url_raw);

                if (res_raw && res_raw.ok) {
                    let subtext = await res_raw.text();

                    if (subtext === '') {
                        console.log(`Page ${page} returned empty. Assuming end of topic.`);
                        return text;
                    }

                    if (subtext.includes("Slow down, you're making too many requests.")) {
                         console.warn(`Raw page ${page} returned rate limit message in body. Retrying...`);
                         retryCount++;
                         let delay = 5000 * retryCount;
                         console.log(`Waiting for ${delay / 1000} seconds before next attempt.`);
                         updateProgress(`速率限制！等待 ${delay / 1000} 秒重试第 ${page} 页...`);
                         await sleep(delay);
                         continue;
                    }

                    pageText = subtext;
                    break;
                } else {
                    retryCount++;
                    let delay = 3000 * retryCount;

                    console.warn(`Request for page ${page} failed (Status: ${res_raw ? res_raw.status : 'N/A'}). Retrying in ${delay / 1000} seconds...`);

                    if (res_raw && res_raw.status === 429) {
                        console.error('Caught 429 Too Many Requests. Increasing delay.');
                        delay = 10000;
                    }

                    updateProgress(`下载失败 (429/Error)。等待 ${delay / 1000} 秒重试第 ${page} 页...`);
                    await sleep(delay);
                }
            }

            if (pageText === null) {
                console.error(`Failed to fetch raw page ${page} after ${MAX_RETRIES} attempts. Aborting raw text fetching.`);
                return text;
            }

            text += pageText;
            page++;
        }
    }

    async function fileDealing(text) {
        let fileList = []
        let fileMap = new Map();

        updateProgress("解析附件链接...");

        const uploadRegex = /\[([^\]]*)\]\((upload:\/\/[^\)]*)\)/g;
        text.replace(uploadRegex, (match, linkText, uploadUrl) => {
            let filename = uploadUrl.slice(9);
            let url = 'https://shuiyuan.sjtu.edu.cn/uploads/short-url/' + filename

            if (!fileMap.has(url)) {
                fileMap.set(url, [url, filename, 0, ''])
                sum += 1
            }
            return match;
        });

        fileList = Array.from(fileMap.values());

        if (fileList.length === 0) {
            updateProgress("未找到附件。");
            return text;
        }

        console.log(`Found ${fileList.length} unique files to download.`);
        updateProgress(`找到 ${fileList.length} 个附件，开始下载...`);

        let downloadedList = await fileDownload(fileList);
        console.log('Download process finished. Starting text replacement.');

        updateProgress("附件下载完成，正在替换文本链接...");

        function replacer(match, linkText, uploadUrl) {
            let filename = uploadUrl.slice(9);
            let url = 'https://shuiyuan.sjtu.edu.cn/uploads/short-url/' + filename;

            let item = downloadedList.find(i => i[0] === url);

            if (item && item[3] !== '') {
                return `[${linkText}](./files/${item[3]})`;
            } else {
                console.warn(`File ${filename} failed to download. Replacing with error tag.`);
                return `[${linkText}](文件下载失败: ${filename})`;
            }
        }

        text = text.replace(/\[([^\]]*)\]\((upload:\/\/[^\)]*)\)/g, replacer);

        return text;
    }

    async function main(btnElement) {
        // 1. 禁用按钮
        if (btnElement) {
            btnElement.disabled = true;
            btnElement.style.opacity = "0.6";
            btnElement.style.cursor = "not-allowed";
        }

        let panel = document.getElementsByClassName('panel')[0]
        if (!panel) {
            console.error("Panel element not found. Cannot start download.");
            if(btnElement) {
                btnElement.disabled = false;
                btnElement.style.opacity = "1";
                btnElement.style.cursor = "pointer";
            }
            return;
        }

        // 2. 获取包裹按钮的 wrapper 容器，并将进度条重置于其下
        let wrapper = btnElement ? btnElement.parentNode : panel;
        resetProgress(wrapper);

        // 重置计数器
        cnt = 0;
        sum = 0;

        let topicID = await getTopicID()
        if (!topicID) {
            alert("无法获取帖子ID。请确保当前页面是一个帖子详情页。");
            updateProgress("❌ 无法获取帖子ID");
            if(btnElement) {
                btnElement.disabled = false;
                btnElement.style.opacity = "1";
                btnElement.style.cursor = "pointer";
            }
            return;
        }

        try {
            zipFiles = {} 

            updateProgress("正在获取帖子标题...");
            let filename = await getFilename()

            // 3. 解析回复关系
            let replyMap = await getReplyRelations(topicID);

            // 4. 获取帖子原始文本
            let text = await getRawText(topicID)

            // 5. 处理文件下载和链接替换
            text = await fileDealing(text)

            // 6. 按楼层分离帖子、标注回复关系、再重新组合
            updateProgress("插入回复标注...");

            const headerRegex = /([^\n]+\|\s*\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\s+UTC\s*\|\s*#(\d+))/g;
            let matches = [];
            let match;
            while ((match = headerRegex.exec(text)) !== null) {
                matches.push({
                    index: match.index,
                    header: match[1],
                    floorNumber: parseInt(match[2], 10),
                    endIndex: headerRegex.lastIndex
                });
            }

            let finalText = '';

            if (matches.length > 0) {
                if (matches[0].index > 0) {
                    finalText += text.substring(0, matches[0].index);
                }

                for (let i = 0; i < matches.length; i++) {
                    const current = matches[i];
                    const next = matches[i + 1];

                    let contentEnd = next ? next.index : text.length;
                    let postContent = text.substring(current.index, contentEnd);

                    // 查询回复关系
                    let replyTo = replyMap.get(current.floorNumber);
                    if (replyTo) {
                        let firstNewline = postContent.indexOf('\n');
                        if (firstNewline !== -1) {
                            let headerLine = postContent.substring(0, firstNewline + 1);
                            let rest = postContent.substring(firstNewline + 1);
                            rest = rest.replace(/^\n+/, '');
                            let annotation = `> 回复第 ${replyTo} 楼\n\n`;
                            postContent = headerLine + annotation + rest;
                        } else {
                            postContent += `\n> 回复第 ${replyTo} 楼\n`;
                        }
                    }

                    finalText += postContent;
                }
            } else {
                finalText = text;
            }

            text = finalText;

            // 5. 将md文本加入文件存储
            zipFiles[filename] = fflate.strToU8(text)

            // 6. 生成并下载 zip 文件
            console.log("开始生成ZIP, 文件数:", Object.keys(zipFiles).length);
            updateProgress("✅ 文件合成中 (生成ZIP)...", 50);

            try {
                const zipped = fflate.zipSync(zipFiles, { level: 0 })
                const blob = new Blob([zipped], { type: 'application/zip' })
                saveAs(blob, topicID + ".zip")
                console.log("ZIP生成完毕，开始保存");
                updateProgress(`🎉 下载完成! (文件: ${topicID}.zip)`, 100);
                
                // 3秒后自动隐藏进度条
                setTimeout(() => {
                    if (progressContainer && progressContainer.parentNode) {
                        progressContainer.parentNode.removeChild(progressContainer);
                    }
                }, 3000);

            } catch(e) {
                console.error("ZIP生成失败:", e);
                alert("文件打包失败，请查看控制台错误信息。");
                updateProgress("❌ 合成失败，请查看控制台。", 100);
            } finally {
                zipFiles = {}
                if(btnElement) {
                    btnElement.disabled = false;
                    btnElement.style.opacity = "1";
                    btnElement.style.cursor = "pointer";
                }
            }
        } catch (e) {
            console.error("Unexpected error in main:", e);
            updateProgress("❌ 发生意外错误，请查看控制台。");
            if(btnElement) {
                btnElement.disabled = false;
                btnElement.style.opacity = "1";
                btnElement.style.cursor = "pointer";
            }
        }
    }

    // 脚本启动
    window.onload = function () {
        let panel = document.getElementsByClassName('panel')[0]
        if (!panel) {
             console.warn("Panel element not found, skipping button creation.");
             return;
        }

        // 创建相对定位的外层容器，用来挂载绝对定位的进度条
        let wrapper = document.createElement('div');
        wrapper.id = 'shuiyuan-exporter-wrapper';
        wrapper.style.display = 'inline-block';
        wrapper.style.position = 'relative';
        wrapper.style.marginRight = '10px';

        // 优化按钮样式：使用深蓝/亮蓝色调及阴影，在所有背景下都能看清
        let buttonMain = document.createElement('button')
        buttonMain.innerHTML = "下载"
        buttonMain.style.cssText = `
            background-color: #0088cc;
            color: #ffffff;
            border: none;
            padding: 5px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            font-size: 14px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            transition: background-color 0.2s;
        `;
        
        buttonMain.onmouseover = () => { buttonMain.style.backgroundColor = "#0077b3"; }
        buttonMain.onmouseout = () => { buttonMain.style.backgroundColor = "#0088cc"; }

        buttonMain.onclick = function() {
            main(this);
        }
        
        // 将按钮装入 wrapper，再将 wrapper 插入 DOM
        wrapper.appendChild(buttonMain);
        panel.insertBefore(wrapper, panel.firstChild)
    }

})();