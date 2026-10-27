# F@Q / Daybook 安卓版 0.2.0

主界面是原 Daybook 日程和身体趋势图。蓝牙绑定、权限和采集开关都放在「设置」，没有单独的采集页面。

## 使用

1. 在 OPPO 上安装 [faq.apk](https://chosenqc.github.io/Homepage/faq.apk)。桌面名称为 F@Q，内部保留 Daybook。支持 Android 12 及以上。
2. 打开 App → 设置 → 同步 Book → 粘贴已有的完整同步链接 → 切换。新安装默认创建新 Book，不会自动读取浏览器的 Book。
3. 开启后台采集，允许附近设备权限和通知。打开手机蓝牙，踩亮自己的小米体脂秤 2。
4. 回到设置，确认发现的蓝牙地址属于自己的秤，再点击「绑定这台秤」。首次绑定后再称一次。
5. 赤脚站稳，直到秤测量结束。数据联网后上传；手机、电脑、iPhone 浏览器使用相同 Book 链接查看图表。

OPPO 请在系统中允许 Daybook 后台活动。采集期间保留系统通知；停止开关位于设置和通知中。重启手机或强制停止 App 后，重新打开一次 App。系统后台限制和实际蓝牙接收情况需要在真机验证。

身体资料中填写身高、年龄和性别后，云端按小米／Mi Fit Legacy 2017 算法的开源复现计算体脂率、肌肉量、含水量、BMI、骨量、基础代谢、蛋白质、内脏脂肪等级和身体年龄。首页选择指标即可切换趋势。结果为估算，可能与当前 Zepp Life 不同；缺少有效阻抗时不会生成体脂、肌肉量和含水量。资料修改会重算历史趋势，历史年龄按年份换算。原始体重、阻抗保留。

算法来源：dckiller51/bodymiscale，修订 f1be05b0339cf14b85e17054bf02331ca921ed58，Apache-2.0；许可见 BODY-METRICS-LICENSE.txt。没有读取 Zepp Life 账号或导入其历史数据。多人共用同一台秤时无法自动识别人，绑定后会记录该秤所有人的称重。

## 内部更新与迁移

日程、图表、算法和设置页面联网加载；重开 App 或设置 → 更新 → 刷新功能即可加载新版，无需安装 APK。蓝牙和系统能力更新使用「检查版本」→ 下载并安装，经过 SHA-256、包名、版本及签名校验后交给安卓系统确认；不能静默安装。

F@Q 使用新包名 com.daybook.faq，和旧 Daybook 0.1 测试版可以并存，不覆盖其本地待传记录。迁移时先确认旧版待上传为 0、复制原 Book 链接、停止旧版采集，再在 F@Q 中切换到该 Book 并绑定秤。不要同时开启两版采集，以免产生重复称重。

断网记录保存在 App 私有存储中，后台每分钟尝试补传，也可在设置中手动重传。卸载或清除 App 数据会移除尚未上传的记录；已上传内容跟随 Book 保存在云端。

完整 Book 链接可以读写该 Book，请自行保管。安装包不包含任何人的 Book 密钥。云端身体数据与日程分开加密存储，公开仓库的 Issues 中只能看到密文。

## 构建与验证

GitHub Actions `Build Daybook Android` 使用 JDK 17、Gradle 8.11.1、Android SDK 35。运行协议样本测试后构建 APK。本机 sign-apk.py 用 .signing/ 中固定私钥重签名生成 faq.apk 和 android-version.json。请私下备份整个 .signing/，不要提交、上传或分享；后续同包名更新必须沿用签名。发布时只上传 APK 和版本 JSON。新版安装、后台保活与系统更新安装器仍需真机验收。

后端源码在本地 `worker/worker.mjs`；`node worker/health.check.mjs` 验证加密、参数校验、去重、阻抗补全和 Book 隔离。`node worker/check.mjs` 与 `node recurrence.check.mjs` 验证原日程功能。
`node body-metrics.check.mjs` 对照上游 Python 生成的 12 组参考值，验证算法及分支边界。
