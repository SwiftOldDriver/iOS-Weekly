# 周报网页维护

网页构建使用 Node.js 20 和 `cwebp`。在 macOS 上可运行 `brew install webp`，在 Ubuntu 上可运行 `sudo apt-get install webp`。

## 本地预览

在仓库根目录运行以下命令，然后打开 <http://localhost:8080/>。

```sh
npm ci --prefix scripts
npm run build:dev --prefix scripts
```

## 构建与测试

安装依赖后，先生成 `_site/`，再运行测试检查生成的页面、链接和搜索。

```sh
npm run build --prefix scripts
npm test --prefix scripts
```

## 发布周报

周报模板在标题下包含 `<!-- site: draft -->`。保留此标记时，该期不会出现在网页首页、归档或搜索中，也不会生成正文页面。准备发布时，移除该期文件中的标记。变更合入后，下一次 GitHub Pages 部署会更新网页。
