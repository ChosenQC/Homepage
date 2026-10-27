# Daybook 安卓测试版

主界面是原 Daybook 日程和身体趋势图。蓝牙绑定、权限和采集开关都放在「设置」，没有单独的采集页面。

## 使用

1. 在 OPPO 上安装 [daybook.apk](https://chosenqc.github.io/Homepage/daybook.apk)。支持 Android 12 及以上。
2. 打开 App → 设置 → 粘贴已有的完整 Book 同步链接 → 保存。新安装默认创建一个新 Book，不会自动读取浏览器里的 Book。
3. 开启后台采集，允许附近设备权限和通知。打开手机蓝牙，踩亮自己的小米体脂秤 2。
4. 回到设置，确认发现的蓝牙地址属于自己的秤，再点击「绑定发现的秤」。首次绑定后再称一次。
5. 赤脚站稳，直到秤测量结束。数据联网后上传；手机、电脑、iPhone 浏览器使用相同 Book 链接查看图表。

OPPO 请在系统中允许 Daybook 后台活动。采集期间保留系统通知；停止开关位于设置和通知中。重启手机或强制停止 App 后，重新打开一次 App。系统后台限制和实际蓝牙接收情况需要在真机验证。

当前记录体重与秤广播的有效阻抗。没有读取 Zepp Life 账号，也没有导入历史数据或生成体脂率、肌肉量、含水量估算。多人共用同一台秤时无法自动识别人，绑定后会记录该秤所有人的称重。

断网记录保存在 App 私有存储中，后台每分钟尝试补传，也可在设置中手动重传。卸载或清除 App 数据会移除尚未上传的记录；已上传内容跟随 Book 保存在云端。

完整 Book 链接可以读写该 Book，请自行保管。安装包不包含任何人的 Book 密钥。云端身体数据与日程分开加密存储，公开仓库的 Issues 中只能看到密文。

## 构建与验证

GitHub Actions `Build Daybook Android` 使用 JDK 17、Gradle 8.11.1、Android SDK 35。运行协议样本测试后构建 `build/outputs/apk/debug/*.apk`。当前是测试签名安装包，未做真机验收。

后端源码在本地 `worker/worker.mjs`；`node worker/health.check.mjs` 验证加密、参数校验、去重、阻抗补全和 Book 隔离。`node worker/check.mjs` 与 `node recurrence.check.mjs` 验证原日程功能。
