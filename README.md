# WorkBuddy 用量状态栏

在 DeepSeek Harness（DSH）输入框下方查看会话用量、WorkBuddy 积分、模型费率和账号余额。桥接插件 dsh-connect-workbuddy 提供响应积分记录，本插件按响应编号将积分归入对应会话。

## 安装

需要 Node.js 22.15 或更新版本，以及 DSH 0.2.1-rc.2 至 0.3.0 之前的版本。

1. 下载项目并运行 npm run build。
2. 在 DSH 插件管理中安装此项目目录。
3. 启用 dsh-connect-workbuddy，并完成账号登录。重新启动 DSH 后，打开会话查看状态栏。

原插件更名后的数据处理方法见[迁移说明](docs/MIGRATION.md)。

## 显示范围

积分消耗按当前会话和模型累计。卡片中的“今日消耗”统计当前会话当天的消耗，以北京时间零点分界。“剩余积分”显示账号余额。切换积分显示设置可以查看全部会话的今日积分。

账号轮换后，同一会话的响应继续累计。插件根据响应编号关联积分；账号余额变化单独记录，用于核对账号收支。

上游记录中的实际积分优先使用。缺少实际积分时，已登记的模型可根据用量估算；每条请求先保留两位小数，再累计。计算条件、四类用量和已知限制见[积分计算](docs/ACCOUNTING.md)。

## 开发

运行 npm run check 构建并执行测试。源码位于 src，构建结果位于 lib。项目结构见[开发说明](docs/DEVELOPMENT.md)，检查结果见[验证记录](docs/VERIFICATION.md)。

[English](README.en.md) · [更新记录](CHANGELOG.md) · [版权说明](THIRD_PARTY_NOTICES.md)
