# Shopify GPT Vercel 接口

此项目用于：

- 自动使用 Shopify Client ID + Client Secret 获取短期访问令牌
- 测试 Shopify 连接和权限
- 读取最新产品
- 创建 Draft 草稿产品
- 写入多规格、SKU、价格、库存、重量、SEO和公开图片链接
- 创建接口强制使用 Draft，不会直接发布

## 需要的Shopify权限

建议在Shopify Dev Dashboard应用版本中启用：

- read_products
- write_products
- read_locations
- read_inventory
- write_inventory

修改权限后，发布新版本并更新安装授权。

## 1. 上传GitHub

1. 解压压缩包。
2. 登录GitHub。
3. 新建仓库，名称建议：shopify-gpt-vercel。
4. 把解压后的全部文件和文件夹上传到仓库。
5. 不要把真实Client Secret写进文件。

## 2. 创建Vercel项目

1. 登录Vercel。
2. 点击 Add New → Project。
3. 连接GitHub。
4. 找到 shopify-gpt-vercel 仓库，点击 Import。
5. Framework Preset选择 Other。
6. Root Directory保持默认。
7. 在部署前添加环境变量。

## 3. Vercel环境变量

添加以下变量：

SHOPIFY_SHOP=rovetrek-2

SHOPIFY_CLIENT_ID=你的Shopify Client ID

SHOPIFY_CLIENT_SECRET=你的Shopify Client Secret

SHOPIFY_API_VERSION=2026-07

GPT_API_KEY=Pa05_KxQRxERvfBhWmW2pJzOMEJhHssnrkMPfvru8GgRF12e

SHOPIFY_LOCATION_ID=可留空

所有变量建议同时勾选Production、Preview和Development。

保存后点击Deploy。

## 4. 检查Vercel

部署状态显示Ready后，打开：

https://你的域名.vercel.app/api/health

四项configured都应为true。

## 5. 接入自定义GPT

1. 打开GPT编辑页面。
2. 进入Actions → Create new action。
3. Authentication选择API Key。
4. Authentication Type选择Bearer。
5. API Key填写与Vercel的GPT_API_KEY完全相同的值。
6. 打开openapi.yaml。
7. 将YOUR-VERCEL-DOMAIN替换成你的真实Vercel域名。
8. 将OpenAPI内容粘贴到Schema中并保存。

## 6. 测试

先发送：

请调用testShopifyConnection，只测试连接，不创建、更新或发布任何产品。返回店铺名称和全部权限。

成功后再发送：

请调用getProducts，读取最新3个产品。本次只读取，不创建、更新或删除任何产品。

## 7. 图片说明

Action调用时，图片必须是Shopify能够访问的公开HTTPS链接。

直接上传到ChatGPT对话里的本地图片，通常不能直接作为Shopify远程图片链接。需要先放到Shopify Files、网站CDN或其他公开存储。

## 8. 安全说明

- Client Secret只放Vercel环境变量。
- 不要放进GitHub、OpenAPI或聊天。
- GPT_API_KEY不要公开。
- 创建接口固定为Draft。
