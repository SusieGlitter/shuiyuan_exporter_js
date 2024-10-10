**这是什么**

鄙人正在尝试使用js实现[@Labyrinth0419](https://github.com/Labyrinth0419/)的[shuiyuan_exporter](https://github.com/Labyrinth0419/shuiyuan_exporter)（的低配版），作为油猴脚本省去获取cookies等步骤

限于本人编程水平与语言差异，可能无法完全还原shuiyuan_exporter的功能和性能，也有可能无法跟上版本

会js的朋友们看到我的代码可能会发火，对不起大家了，我会试着在实现过程中精进代码力的，对不起！对不起！对不起！

总结：一切随缘

---

**使用库**

1. JSzip/3.7.1
2. FileSaver/2.0.5
3. asyncPool （将要使用）

---

**目前已经实现的功能**

1. 获取cookies，网址，topicID，raw
2. 最简陋的按钮交互
3. zip文件写入与下载

---

**目前没有实现的功能**

1. 对于各种可能报错的处理
2. ~~炫酷的按钮~~
3. 图片、附件、视频、音频备份（正在尝试理解混淆）
4. 并行下载以及错误重试
5. 性能优化（还没到需要性能的时候）

---

**欢迎批评**