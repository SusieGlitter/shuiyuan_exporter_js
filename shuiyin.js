// ==UserScript==
// @name         去水印
// @namespace    http://tampermonkey.net/
// @version      2024-10-11
// @description  try to take over the world!
// @author       You
// @match        https://shuiyuan.sjtu.edu.cn/
// @match        https://shuiyuan.sjtu.edu.cn/*
// @match        https://shuiyuan.sjtu.edu.cn/*/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=tampermonkey.net
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    function removeWatermarkAndAvatar(){
        let div=document.getElementsByTagName('div')
        for(let i=0;i<div.length;i++){
            if(div[i].innerHTML.slice(0,40).includes('<div style="position: fixed;')){
                div[i].remove()
                console.log('Simple_watermark removed')
                break
            }
        }
        div=document.getElementById("watermark-background")
        if(div.length!=0){
            div.remove()
            console.log('Special-watermark removed')
        }
        div=document.getElementById("toggle-current-user")
        div=div.getElementsByClassName("avatar")[0]
        div.src='https://shuiyuan.s3.jcloud.sjtu.edu.cn/optimized/4X/5/d/2/5d265065268cc5d7d3e54c6513348e8657d8e309_2_512x512.png'
        console.log('Avatar removed')
    }
    window.onload=function(){
        let buttonTest = document.createElement('button')
        buttonTest.innerHTML = "    "
        buttonTest.style.color = "black"
        let div2 = document.getElementsByClassName('panel')[0]
        div2.insertBefore(buttonTest, div2.firstChild)
        buttonTest.onclick = removeWatermarkAndAvatar
    }
})();