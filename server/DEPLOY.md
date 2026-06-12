# ApplyRadar 后端部署指南

## 环境要求

- Node.js >= 18
- 域名 + SSL 证书（小程序要求 HTTPS）

## 本地开发

```bash
cd server
cp .env.example .env
# 编辑 .env，修改 JWT_SECRET

npm install
npm run dev
```

服务启动后访问 http://localhost:3000 验证。

## 服务器部署

### 1. 上传代码

```bash
scp -r server/ user@your-server:/opt/applyradar/
```

### 2. 安装依赖

```bash
cd /opt/applyradar/server
npm install --production
```

### 3. 配置环境变量

```bash
cp .env.example .env
vim .env
```

修改以下配置：
```
PORT=3000
HOST=127.0.0.1
JWT_SECRET=使用随机字符串，例如: openssl rand -hex 32
DB_PATH=./data/applyradar.db
```

### 4. 使用 PM2 守护进程

```bash
npm install -g pm2
pm2 start npm --name "applyradar" -- start
pm2 save
pm2 startup
```

### 5. 配置 Nginx 反向代理 + HTTPS

```nginx
server {
    listen 80;
    server_name www.yezzy7.xyz yezzy7.xyz;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name www.yezzy7.xyz yezzy7.xyz;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 6. 申请免费 SSL 证书

使用 Let's Encrypt（Certbot）：

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d www.yezzy7.xyz -d yezzy7.xyz
```

## 小程序对接

备案通过后，修改小程序的服务调用地址：

```typescript
// miniprogram/services/common.ts
const BASE_URL = 'https://www.yezzy7.xyz';

export async function callCloud<T>(name: string, action: string, data?: any): Promise<T> {
  const token = wx.getStorageSync('token');
  const res = await new Promise<wx.RequestSuccessCallbackResult>((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}/api/${name}`,
      method: action === 'create' ? 'POST' : action === 'delete' ? 'DELETE' : action === 'update' ? 'PUT' : 'GET',
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
      },
      data,
      success: resolve,
      fail: reject,
    });
  });

  const result = res.data as any;
  if (result.code !== 0) {
    throw new Error(result.msg || '操作失败');
  }
  return result.data;
}
```

## 桌面端对接

修改桌面端的 service 层，将 Tauri invoke 替换为 HTTP 调用：

```typescript
// 以 applicationService 为例
const BASE_URL = 'https://www.yezzy7.xyz';

export const applicationService = {
  async list(search?: string, status?: string) {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('status', status);

    const res = await fetch(`${BASE_URL}/api/applications?${params}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` },
    });
    const data = await res.json();
    if (data.code !== 0) throw new Error(data.msg);
    return data.data;
  },
  // ... 其他方法类似
};
```

## 数据备份

SQLite 数据库文件位于 `./data/applyradar.db`，定期备份：

```bash
# 每天备份
cp /opt/applyradar/server/data/applyradar.db /backup/applyradar-$(date +%Y%m%d).db
```
