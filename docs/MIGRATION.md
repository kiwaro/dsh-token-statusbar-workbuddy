# 更名与迁移

项目名称由 dsh-token-statusbar 改为 dsh-token-statusbar-workbuddy，工程目录由 D:/tmp/dsh-token-statusbar 移到 D:/work/dsh-token-statusbar-workbuddy。

## 更新安装

1. 构建新项目，将 DSH 安装引用改为新目录和新包名。
2. 备份并移出旧安装包，安装新包。
3. 重新启动 DSH，检查状态栏和已有会话数据。

## 保存的数据

数据目录位于 DSH_HOME 指定目录下的 storages；未设置时使用用户目录下的 .dsh/storages。首次读取新目录时，会复制旧目录中的 payload-cache.json、credits-exact-v2.jsonl、credits.jsonl、account-reconciliation.json 和 account-reconciliation.jsonl。新目录中的同名文件优先保留。旧目录及其文件保留，凭据文件留在原处。

界面先读取新名称对应的浏览器设置；缺少新设置时读取旧设置。保存设置时使用新名称。恢复旧版时，恢复旧安装包和原安装引用，再重新启动 DSH。新版本运行期间增加的记录需另行核对后合并。
