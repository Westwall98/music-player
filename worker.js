// Cloudflare Worker - 处理R2 bucket访问
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        
        // CORS头
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': '*',
        };
        
        // 处理预检请求
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: corsHeaders
            });
        }
        
        // 根路径返回列表页面
        if (path === '/' || path === '/list') {
            return new Response(LIST_HTML, {
                headers: {
                    'Content-Type': 'text/html;charset=UTF-8',
                    ...corsHeaders
                }
            });
        }
        
        // 播放器页面
        if (path === '/player') {
            return new Response(PLAYER_HTML, {
                headers: {
                    'Content-Type': 'text/html;charset=UTF-8',
                    ...corsHeaders
                }
            });
        }
        
        // 获取文件列表API
        if (path === '/api/files') {
            try {
                // 列出R2 bucket中的所有文件
                const objects = await env.MUSIC_BUCKET.list();
                
                // 过滤出音频文件并提取元数据
                const musicFiles = await Promise.all(
                    objects.objects
                        .filter(obj => {
                            const ext = obj.key.split('.').pop().toLowerCase();
                            return ['mp3', 'flac', 'wav', 'aac', 'm4a', 'ogg'].includes(ext);
                        })
                        .map(async (obj) => {
                            // 尝试获取文件的部分数据来读取元数据
                            const file = await env.MUSIC_BUCKET.get(obj.key, {
                                range: { offset: 0, length: 50000 } // 读取前50KB用于元数据解析
                            });
                            
                            if (!file) return null;
                            
                            const arrayBuffer = await file.arrayBuffer();
                            const uint8Array = new Uint8Array(arrayBuffer);
                            
                            // 简单解析文件名
                            const filename = obj.key.split('/').pop();
                            const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
                            
                            // 尝试从文件名提取信息（格式：艺术家 - 歌曲名 - 专辑）
                            const parts = nameWithoutExt.split(' - ');
                            
                            return {
                                id: obj.key,
                                filename: filename,
                                key: obj.key,
                                title: parts.length >= 2 ? parts[1] : nameWithoutExt,
                                artist: parts.length >= 1 ? parts[0] : '未知艺术家',
                                album: parts.length >= 3 ? parts[2] : '未知专辑',
                                size: obj.size,
                                uploaded: obj.uploaded,
                                url: `${url.origin}/api/stream/${encodeURIComponent(obj.key)}`
                            };
                        })
                );
                
                // 过滤掉null值
                const filteredFiles = musicFiles.filter(file => file !== null);
                
                return new Response(JSON.stringify(filteredFiles), {
                    headers: {
                        'Content-Type': 'application/json',
                        ...corsHeaders
                    }
                });
            } catch (error) {
                return new Response(JSON.stringify({ error: error.message }), {
                    status: 500,
                    headers: {
                        'Content-Type': 'application/json',
                        ...corsHeaders
                    }
                });
            }
        }
        
        // 流式传输音乐文件
        if (path.startsWith('/api/stream/')) {
            const key = decodeURIComponent(path.replace('/api/stream/', ''));
            
            try {
                const object = await env.MUSIC_BUCKET.get(key);
                
                if (object === null) {
                    return new Response('File not found', { status: 404 });
                }
                
                // 支持范围请求（用于音频播放）
                const range = request.headers.get('range');
                let start = 0;
                let end = object.size - 1;
                
                if (range) {
                    const parts = range.replace(/bytes=/, '').split('-');
                    start = parseInt(parts[0], 10);
                    end = parts[1] ? parseInt(parts[1], 10) : object.size - 1;
                }
                
                const chunksize = (end - start) + 1;
                
                // 获取部分数据
                const data = await object.range(start, end).arrayBuffer();
                
                const headers = {
                    'Content-Type': object.httpMetadata?.contentType || 'audio/mpeg',
                    'Content-Length': chunksize.toString(),
                    'Content-Range': `bytes ${start}-${end}/${object.size}`,
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'public, max-age=31536000',
                    ...object.httpMetadata,
                    ...corsHeaders
                };
                
                return new Response(data, {
                    status: range ? 206 : 200,
                    headers
                });
            } catch (error) {
                return new Response('Error streaming file', { status: 500 });
            }
        }
        
        // 获取封面图片
        if (path.startsWith('/api/cover/')) {
            const key = decodeURIComponent(path.replace('/api/cover/', ''));
            
            try {
                // 先尝试查找同目录下的封面图片
                const coverKey = key.replace(/\.[^/.]+$/, '.jpg');
                const coverKey2 = key.replace(/\.[^/.]+$/, '.png');
                const folderPath = key.substring(0, key.lastIndexOf('/'));
                const folderCover = folderPath ? `${folderPath}/cover.jpg` : 'cover.jpg';
                const folderCover2 = folderPath ? `${folderPath}/cover.png` : 'cover.png';
                
                let object = await env.MUSIC_BUCKET.get(coverKey);
                if (!object) object = await env.MUSIC_BUCKET.get(coverKey2);
                if (!object) object = await env.MUSIC_BUCKET.get(folderCover);
                if (!object) object = await env.MUSIC_BUCKET.get(folderCover2);
                
                if (object === null) {
                    // 返回一个默认的封面
                    return new Response(DEFAULT_COVER_SVG, {
                        headers: {
                            'Content-Type': 'image/svg+xml',
                            'Cache-Control': 'public, max-age=3600',
                            ...corsHeaders
                        }
                    });
                }
                
                const headers = {
                    'Content-Type': object.httpMetadata?.contentType || 'image/jpeg',
                    'Cache-Control': 'public, max-age=31536000',
                    ...object.httpMetadata,
                    ...corsHeaders
                };
                
                return new Response(object.body, { headers });
            } catch (error) {
                return new Response(DEFAULT_COVER_SVG, {
                    headers: {
                        'Content-Type': 'image/svg+xml',
                        'Cache-Control': 'public, max-age=3600',
                        ...corsHeaders
                    }
                });
            }
        }
        
        // 默认返回404
        return new Response('Not found', { status: 404 });
    }
};

// 默认封面SVG
const DEFAULT_COVER_SVG = `<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#ff375f;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#00c2ff;stop-opacity:1" />
        </linearGradient>
    </defs>
    <rect width="400" height="400" fill="url(#grad)" rx="10"/>
    <text x="200" y="200" font-family="Arial" font-size="60" fill="white" 
          text-anchor="middle" dominant-baseline="middle">♪</text>
</svg>`;

// 列表页面HTML
const LIST_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>音乐库</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #1a1a2e, #16213e);
            color: white;
            min-height: 100vh;
            padding: 40px 20px;
        }
        
        .container {
            max-width: 1000px;
            margin: 0 auto;
        }
        
        header {
            text-align: center;
            margin-bottom: 40px;
        }
        
        h1 {
            font-size: 3rem;
            margin-bottom: 10px;
            background: linear-gradient(90deg, #ff375f, #00c2ff);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
        }
        
        .subtitle {
            color: rgba(255, 255, 255, 0.6);
            font-size: 1.2rem;
        }
        
        .controls {
            display: flex;
            justify-content: center;
            gap: 15px;
            margin-bottom: 30px;
            flex-wrap: wrap;
        }
        
        .search-box {
            flex-grow: 1;
            max-width: 400px;
        }
        
        input {
            width: 100%;
            padding: 12px 20px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 25px;
            color: white;
            font-size: 16px;
            outline: none;
        }
        
        input:focus {
            border-color: #00c2ff;
        }
        
        .refresh-btn {
            background: linear-gradient(135deg, #ff375f, #00c2ff);
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 25px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: transform 0.3s ease;
        }
        
        .refresh-btn:hover {
            transform: scale(1.05);
        }
        
        .loading {
            text-align: center;
            padding: 40px;
            color: rgba(255, 255, 255, 0.7);
        }
        
        .loading-spinner {
            display: inline-block;
            width: 40px;
            height: 40px;
            border: 3px solid rgba(255, 255, 255, 0.1);
            border-radius: 50%;
            border-top-color: #00c2ff;
            animation: spin 1s ease infinite;
            margin-bottom: 15px;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .music-list {
            display: grid;
            gap: 15px;
        }
        
        .music-item {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 15px;
            padding: 20px;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 20px;
        }
        
        .music-item:hover {
            background: rgba(255, 255, 255, 0.1);
            transform: translateY(-2px);
            border-color: rgba(0, 194, 255, 0.3);
        }
        
        .album-art {
            width: 80px;
            height: 80px;
            border-radius: 8px;
            object-fit: cover;
            flex-shrink: 0;
            background: linear-gradient(135deg, #ff375f, #00c2ff);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 24px;
        }
        
        .music-info {
            flex-grow: 1;
            min-width: 0;
        }
        
        .music-title {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 5px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        .music-artist {
            color: rgba(255, 255, 255, 0.7);
            margin-bottom: 3px;
            font-size: 14px;
        }
        
        .music-album {
            color: rgba(255, 255, 255, 0.5);
            font-size: 13px;
        }
        
        .play-btn {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            color: white;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            flex-shrink: 0;
            transition: all 0.3s ease;
        }
        
        .play-btn:hover {
            background: linear-gradient(135deg, #ff375f, #00c2ff);
            transform: scale(1.1);
        }
        
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: rgba(255, 255, 255, 0.5);
        }
        
        .empty-state i {
            font-size: 60px;
            margin-bottom: 20px;
            opacity: 0.5;
        }
        
        @media (max-width: 768px) {
            .music-item {
                flex-direction: column;
                text-align: center;
                gap: 15px;
            }
            
            .album-art {
                width: 120px;
                height: 120px;
            }
            
            .play-btn {
                width: 60px;
                height: 60px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1><i class="fas fa-music"></i> 音乐库</h1>
            <p class="subtitle">从R2 Bucket中加载您的音乐</p>
        </header>
        
        <div class="controls">
            <div class="search-box">
                <input type="text" id="searchInput" placeholder="搜索歌曲、艺术家或专辑...">
            </div>
            <button class="refresh-btn" id="refreshBtn">
                <i class="fas fa-sync-alt"></i>
                刷新列表
            </button>
        </div>
        
        <div id="loading" class="loading">
            <div class="loading-spinner"></div>
            <p>正在加载音乐列表...</p>
        </div>
        
        <div id="musicList" class="music-list" style="display: none;"></div>
        
        <div id="emptyState" class="empty-state" style="display: none;">
            <i class="fas fa-music"></i>
            <h3>没有找到音乐文件</h3>
            <p>请确保R2 Bucket中有音频文件</p>
        </div>
    </div>
    
    <script>
        let allMusicFiles = [];
        
        async function loadMusicList() {
            const loadingEl = document.getElementById('loading');
            const listEl = document.getElementById('musicList');
            const emptyEl = document.getElementById('emptyState');
            
            loadingEl.style.display = 'block';
            listEl.style.display = 'none';
            emptyEl.style.display = 'none';
            
            try {
                const response = await fetch('/api/files');
                if (!response.ok) throw new Error('Failed to load music list');
                
                allMusicFiles = await response.json();
                displayMusicList(allMusicFiles);
                
                if (allMusicFiles.length === 0) {
                    emptyEl.style.display = 'block';
                }
            } catch (error) {
                console.error('Error loading music:', error);
                listEl.innerHTML = '<div class="empty-state"><p>加载失败: ' + error.message + '</p></div>';
                listEl.style.display = 'block';
            } finally {
                loadingEl.style.display = 'none';
            }
        }
        
        function displayMusicList(files) {
            const listEl = document.getElementById('musicList');
            const searchTerm = document.getElementById('searchInput').value.toLowerCase();
            
            const filteredFiles = files.filter(file => {
                if (!searchTerm) return true;
                return (
                    file.title.toLowerCase().includes(searchTerm) ||
                    file.artist.toLowerCase().includes(searchTerm) ||
                    file.album.toLowerCase().includes(searchTerm)
                );
            });
            
            if (filteredFiles.length === 0) {
                listEl.innerHTML = '<div class="empty-state"><p>没有找到匹配的音乐</p></div>';
                listEl.style.display = 'block';
                return;
            }
            
            const html = filteredFiles.map(file => \`
                <div class="music-item" data-id="\${file.id}">
                    <div class="album-art" data-key="\${file.key}">
                        <i class="fas fa-music"></i>
                    </div>
                    <div class="music-info">
                        <div class="music-title">\${file.title}</div>
                        <div class="music-artist">\${file.artist}</div>
                        <div class="music-album">\${file.album} • \${formatFileSize(file.size)}</div>
                    </div>
                    <div class="play-btn" onclick="playSong('\${file.id}', '\${encodeURIComponent(JSON.stringify(file))}')">
                        <i class="fas fa-play"></i>
                    </div>
                </div>
            \`).join('');
            
            listEl.innerHTML = html;
            listEl.style.display = 'grid';
            
            // 延迟加载封面图片
            filteredFiles.forEach(file => {
                loadAlbumArt(file.key);
            });
        }
        
        function loadAlbumArt(key) {
            const albumArtEl = document.querySelector(\`.album-art[data-key="\${key}"]\`);
            if (!albumArtEl) return;
            
            const img = new Image();
            img.onload = function() {
                albumArtEl.style.background = 'none';
                albumArtEl.innerHTML = '';
                albumArtEl.appendChild(img);
            };
            img.onerror = function() {
                // 保持默认样式
            };
            img.src = \`/api/cover/\${encodeURIComponent(key)}\`;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.style.borderRadius = '8px';
        }
        
        function playSong(id, fileData) {
            const file = JSON.parse(decodeURIComponent(fileData));
            // 跳转到播放器页面，传递歌曲信息
            const params = new URLSearchParams({
                id: file.id,
                title: file.title,
                artist: file.artist,
                album: file.album,
                url: file.url,
                key: file.key
            });
            window.location.href = \`/player?\${params.toString()}\`;
        }
        
        function formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        // 初始化
        document.addEventListener('DOMContentLoaded', () => {
            loadMusicList();
            
            document.getElementById('refreshBtn').addEventListener('click', loadMusicList);
            
            document.getElementById('searchInput').addEventListener('input', (e) => {
                displayMusicList(allMusicFiles);
            });
        });
    </script>
</body>
</html>`;

// 播放器页面HTML
const PLAYER_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>音乐播放器</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://unpkg.com/colorthief@2.3.0/dist/color-thief.umd.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background-color: #000;
            color: #fff;
            height: 100vh;
            overflow: hidden;
            position: relative;
        }

        /* Apple Music风格流体背景 */
        .fluid-background {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: -1;
            overflow: hidden;
        }

        .gradient-layer {
            position: absolute;
            top: -50%;
            left: -50%;
            width: 200%;
            height: 200%;
            background-size: 400% 400%;
            animation: fluidMove 40s ease infinite;
            filter: blur(60px);
            opacity: 0.8;
            mix-blend-mode: screen;
        }

        .gradient-layer:nth-child(2) {
            animation: fluidMove 35s ease-in-out infinite reverse;
            mix-blend-mode: multiply;
            opacity: 0.6;
        }

        .gradient-layer:nth-child(3) {
            animation: fluidMove 45s ease-in-out infinite;
            mix-blend-mode: overlay;
            opacity: 0.7;
        }

        @keyframes fluidMove {
            0% {
                background-position: 0% 50%;
                transform: translate(0, 0) rotate(0deg);
            }
            25% {
                background-position: 100% 50%;
                transform: translate(3%, 3%) rotate(90deg);
            }
            50% {
                background-position: 100% 100%;
                transform: translate(0, 5%) rotate(180deg);
            }
            75% {
                background-position: 0% 100%;
                transform: translate(-3%, 3%) rotate(270deg);
            }
            100% {
                background-position: 0% 50%;
                transform: translate(0, 0) rotate(360deg);
            }
        }

        /* 播放器容器 */
        .player-container {
            height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
            padding: 40px;
            position: relative;
            z-index: 1;
        }

        /* 顶部控制栏 */
        .top-controls {
            width: 100%;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 20px;
        }

        .back-btn {
            background: rgba(255, 255, 255, 0.15);
            border: 1px solid rgba(255, 255, 255, 0.25);
            color: white;
            padding: 12px 24px;
            border-radius: 20px;
            font-size: 15px;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 8px;
            backdrop-filter: blur(20px);
            font-weight: 500;
            text-decoration: none;
        }

        .back-btn:hover {
            background: rgba(255, 255, 255, 0.2);
            transform: scale(1.05);
        }

        /* 主内容区域 */
        .main-content {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: 100%;
            max-width: 800px;
            gap: 40px;
            flex-grow: 1;
        }

        /* 专辑封面 */
        .album-art-container {
            position: relative;
            width: clamp(250px, 40vw, 350px);
            height: clamp(250px, 40vw, 350px);
            transition: all 0.3s ease;
        }

        .album-art {
            width: 100%;
            height: 100%;
            border-radius: 10px;
            object-fit: cover;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
        }

        .album-art-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(to bottom, rgba(0,0,0,0) 60%, rgba(0,0,0,0.3) 100%);
            border-radius: 10px;
            pointer-events: none;
        }

        /* 歌曲信息 */
        .song-info {
            text-align: center;
            width: 100%;
        }

        .song-title {
            font-size: clamp(28px, 4vw, 40px);
            font-weight: 700;
            margin-bottom: 8px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 90vw;
        }

        .song-artist {
            font-size: clamp(18px, 2.5vw, 24px);
            color: rgba(255, 255, 255, 0.85);
            font-weight: 500;
            margin-bottom: 5px;
        }

        .song-album {
            font-size: clamp(14px, 2vw, 18px);
            color: rgba(255, 255, 255, 0.6);
        }

        /* 播放控件区域 */
        .player-controls-container {
            width: 100%;
            max-width: 600px;
            display: flex;
            flex-direction: column;
            gap: 30px;
        }

        /* 进度条 */
        .progress-container {
            width: 100%;
        }

        .progress-bar {
            width: 100%;
            height: 4px;
            background: rgba(255, 255, 255, 0.15);
            border-radius: 2px;
            overflow: hidden;
            cursor: pointer;
            margin-bottom: 8px;
        }

        .progress {
            width: 0%;
            height: 100%;
            background: #ffffff;
            border-radius: 2px;
            transition: width 0.1s linear;
            position: relative;
        }

        .progress::after {
            content: '';
            position: absolute;
            right: -6px;
            top: 50%;
            transform: translateY(-50%);
            width: 12px;
            height: 12px;
            background: white;
            border-radius: 50%;
            opacity: 0;
            transition: opacity 0.2s ease;
            box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
        }

        .progress-bar:hover .progress::after {
            opacity: 1;
        }

        .time-display {
            display: flex;
            justify-content: space-between;
            font-size: 14px;
            color: rgba(255, 255, 255, 0.7);
        }

        /* 播放控制按钮 */
        .playback-controls {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: clamp(30px, 5vw, 50px);
        }

        .playback-btn {
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .playback-btn:active {
            transform: scale(0.95);
        }

        .secondary-btn {
            width: clamp(40px, 8vw, 50px);
            height: clamp(40px, 8vw, 50px);
            font-size: clamp(16px, 3vw, 20px);
            color: rgba(255, 255, 255, 0.85);
        }

        .secondary-btn:hover {
            color: white;
            transform: scale(1.1);
        }

        .play-btn {
            width: clamp(60px, 12vw, 70px);
            height: clamp(60px, 12vw, 70px);
            background: white;
            border-radius: 50%;
            color: #000;
            font-size: clamp(20px, 4vw, 24px);
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
        }

        .play-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 15px 40px rgba(0, 0, 0, 0.4);
        }

        /* 加载状态 */
        .loading {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 100;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease;
        }

        .loading.active {
            opacity: 1;
            pointer-events: all;
        }

        .loading-spinner {
            width: 60px;
            height: 60px;
            border: 4px solid rgba(255, 255, 255, 0.1);
            border-radius: 50%;
            border-top-color: #ffffff;
            animation: spin 1s ease infinite;
            margin-bottom: 20px;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .loading-text {
            color: rgba(255, 255, 255, 0.7);
            font-size: 16px;
        }

        /* 响应式调整 */
        @media (max-width: 768px) {
            .player-container {
                padding: 20px;
                gap: 30px;
            }
            
            .main-content {
                gap: 30px;
            }
            
            .player-controls-container {
                gap: 20px;
            }
            
            .album-art-container {
                width: clamp(200px, 60vw, 300px);
                height: clamp(200px, 60vw, 300px);
            }
        }
    </style>
</head>
<body>
    <!-- 加载状态 -->
    <div class="loading" id="loading">
        <div class="loading-spinner"></div>
        <div class="loading-text" id="loadingText">正在加载音乐...</div>
    </div>

    <!-- Apple Music风格流体背景 -->
    <div class="fluid-background" id="fluidBackground">
        <div class="gradient-layer" id="gradientLayer1"></div>
        <div class="gradient-layer" id="gradientLayer2"></div>
        <div class="gradient-layer" id="gradientLayer3"></div>
    </div>

    <!-- 播放器主界面 -->
    <div class="player-container">
        <!-- 顶部控制栏 -->
        <div class="top-controls">
            <a href="/" class="back-btn">
                <i class="fas fa-arrow-left"></i>
                返回列表
            </a>
        </div>

        <!-- 主内容区域 -->
        <div class="main-content">
            <!-- 专辑封面 -->
            <div class="album-art-container">
                <img id="albumArt" class="album-art" alt="专辑封面">
                <div class="album-art-overlay"></div>
            </div>

            <!-- 歌曲信息 -->
            <div class="song-info">
                <div class="song-title" id="songTitle">加载中...</div>
                <div class="song-artist" id="songArtist"></div>
                <div class="song-album" id="songAlbum"></div>
            </div>

            <!-- 播放控件 -->
            <div class="player-controls-container">
                <!-- 进度条 -->
                <div class="progress-container">
                    <div class="progress-bar" id="progressBar">
                        <div class="progress" id="progress"></div>
                    </div>
                    <div class="time-display">
                        <span id="currentTime">0:00</span>
                        <span id="duration">0:00</span>
                    </div>
                </div>

                <!-- 播放控制按钮 -->
                <div class="playback-controls">
                    <button class="playback-btn secondary-btn" id="prevBtn">
                        <i class="fas fa-backward-step"></i>
                    </button>
                    
                    <button class="playback-btn play-btn" id="playBtn">
                        <i class="fas fa-play" id="playIcon"></i>
                    </button>
                    
                    <button class="playback-btn secondary-btn" id="nextBtn">
                        <i class="fas fa-forward-step"></i>
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- 音频元素 -->
    <audio id="audioPlayer" preload="metadata" volume="1"></audio>

    <script>
        // 初始化 ColorThief
        const colorThief = new ColorThief();
        
        // DOM元素
        const audioPlayer = document.getElementById('audioPlayer');
        const loading = document.getElementById('loading');
        const loadingText = document.getElementById('loadingText');
        const albumArt = document.getElementById('albumArt');
        const songTitle = document.getElementById('songTitle');
        const songArtist = document.getElementById('songArtist');
        const songAlbum = document.getElementById('songAlbum');
        const playBtn = document.getElementById('playBtn');
        const playIcon = document.getElementById('playIcon');
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        const progressBar = document.getElementById('progressBar');
        const progress = document.getElementById('progress');
        const currentTimeEl = document.getElementById('currentTime');
        const durationEl = document.getElementById('duration');
        const gradientLayer1 = document.getElementById('gradientLayer1');
        const gradientLayer2 = document.getElementById('gradientLayer2');
        const gradientLayer3 = document.getElementById('gradientLayer3');
        
        // 状态变量
        let isPlaying = false;
        let currentColors = ['#ff375f', '#00c2ff', '#ffd600', '#9c5dff'];
        let currentSong = null;
        
        // 从URL参数获取歌曲信息
        function getSongFromUrl() {
            const params = new URLSearchParams(window.location.search);
            return {
                id: params.get('id'),
                title: params.get('title'),
                artist: params.get('artist'),
                album: params.get('album'),
                url: params.get('url'),
                key: params.get('key')
            };
        }
        
        // 加载歌曲
        async function loadSong() {
            currentSong = getSongFromUrl();
            
            if (!currentSong.url) {
                alert('无效的歌曲信息');
                window.location.href = '/';
                return;
            }
            
            showLoading('正在加载音乐...');
            
            // 设置歌曲信息
            songTitle.textContent = currentSong.title || '未知歌曲';
            songArtist.textContent = currentSong.artist || '未知艺术家';
            songAlbum.textContent = currentSong.album || '未知专辑';
            
            try {
                // 加载专辑封面
                await loadAlbumArt();
                
                // 设置音频源
                audioPlayer.src = currentSong.url;
                
                hideLoading();
                
                // 自动播放
                setTimeout(() => {
                    playAudio();
                }, 500);
                
            } catch (error) {
                console.error('加载失败:', error);
                hideLoading();
                alert('加载音乐失败: ' + error.message);
            }
        }
        
        // 加载专辑封面
        async function loadAlbumArt() {
            if (!currentSong.key) return;
            
            try {
                const coverUrl = \`/api/cover/\${encodeURIComponent(currentSong.key)}\`;
                albumArt.src = coverUrl;
                
                // 等待图片加载完成
                await new Promise((resolve, reject) => {
                    albumArt.onload = resolve;
                    albumArt.onerror = reject;
                });
                
                // 提取颜色
                extractColorsFromImage(albumArt);
                
            } catch (error) {
                console.warn('无法加载专辑封面:', error);
                // 使用默认封面
                albumArt.src = createDefaultCover();
                extractColorsFromImage(albumArt);
            }
        }
        
        // 创建默认封面
        function createDefaultCover() {
            const canvas = document.createElement('canvas');
            canvas.width = 400;
            canvas.height = 400;
            const ctx = canvas.getContext('2d');
            
            // 基于歌曲标题生成颜色
            const hue = currentSong.title 
                ? currentSong.title.split('').reduce((a, b) => a + b.charCodeAt(0), 0) % 360
                : Math.random() * 360;
            
            const gradient = ctx.createLinearGradient(0, 0, 400, 400);
            gradient.addColorStop(0, \`hsl(\${hue}, 70%, 50%)\`);
            gradient.addColorStop(1, \`hsl(\${(hue + 90) % 360}, 70%, 60%)\`);
            
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 400, 400);
            
            // 添加音乐图标
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.font = '100px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('♪', 200, 200);
            
            return canvas.toDataURL();
        }
        
        // 从图片提取颜色
        function extractColorsFromImage(imgElement) {
            try {
                if (!colorThief) {
                    useFallbackColors();
                    return;
                }
                
                const palette = colorThief.getPalette(imgElement, 6);
                const hexColors = palette.map(rgb => rgbToHex(rgb[0], rgb[1], rgb[2]));
                
                // 过滤掉太暗或太亮的颜色
                const filteredColors = hexColors.filter(color => {
                    const brightness = getColorBrightness(color);
                    return brightness > 30 && brightness < 220;
                });
                
                if (filteredColors.length >= 4) {
                    currentColors = filteredColors.slice(0, 4);
                } else {
                    currentColors = [...filteredColors];
                    const baseColor = filteredColors[0] || '#ff375f';
                    const complementaryColors = generateComplementaryColors(baseColor);
                    currentColors.push(...complementaryColors.slice(0, 4 - filteredColors.length));
                }
                
                updateFluidBackground(currentColors);
                
            } catch (error) {
                console.warn('颜色提取失败:', error);
                useFallbackColors();
            }
        }
        
        // 使用回退颜色
        function useFallbackColors() {
            const fallbackPalettes = [
                ['#ff375f', '#00c2ff', '#ffd600', '#9c5dff'],
                ['#ff0080', '#00ffcc', '#ffcc00', '#9966ff'],
                ['#00ffaa', '#ff3366', '#ff9900', '#8866ff'],
                ['#ff0066', '#00ddff', '#ffdd00', '#aa66ff'],
                ['#ff5e62', '#00b09b', '#ffc837', '#8e2de2']
            ];
            
            const randomIndex = Math.floor(Math.random() * fallbackPalettes.length);
            currentColors = fallbackPalettes[randomIndex];
            updateFluidBackground(currentColors);
        }
        
        // RGB转十六进制
        function rgbToHex(r, g, b) {
            return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        }
        
        // 生成互补颜色
        function generateComplementaryColors(baseColor) {
            const hue = getHueFromColor(baseColor);
            return [
                baseColor,
                \`hsl(\${(hue + 120) % 360}, 70%, 50%)\`,
                \`hsl(\${(hue + 240) % 360}, 70%, 50%)\`,
                \`hsl(\${(hue + 60) % 360}, 70%, 60%)\`
            ];
        }
        
        // 从颜色获取色相
        function getHueFromColor(color) {
            if (color.startsWith('hsl')) {
                const hueMatch = color.match(/hsl\\((\d+)/);
                return hueMatch ? parseInt(hueMatch[1]) : 0;
            }
            
            // 如果是十六进制颜色，转换为HSL
            const rgb = hexToRgb(color);
            const r = rgb[0] / 255;
            const g = rgb[1] / 255;
            const b = rgb[2] / 255;
            
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            let h = 0;
            
            if (max !== min) {
                if (max === r) h = (g - b) / (max - min);
                else if (max === g) h = 2 + (b - r) / (max - min);
                else h = 4 + (r - g) / (max - min);
                
                h = h * 60;
                if (h < 0) h += 360;
            }
            
            return Math.round(h);
        }
        
        // 十六进制转RGB
        function hexToRgb(hex) {
            const result = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
            return result ? [
                parseInt(result[1], 16),
                parseInt(result[2], 16),
                parseInt(result[3], 16)
            ] : [0, 0, 0];
        }
        
        // 获取颜色亮度
        function getColorBrightness(hexColor) {
            const rgb = hexToRgb(hexColor);
            return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
        }
        
        // 更新流体背景
        function updateFluidBackground(colors) {
            const bgColors = [...colors];
            while (bgColors.length < 4) {
                bgColors.push(bgColors[bgColors.length % bgColors.length]);
            }
            
            const gradient1 = \`linear-gradient(45deg, \${bgColors[0]}, \${bgColors[1]}, \${bgColors[2]}, \${bgColors[3]})\`;
            const gradient2 = \`linear-gradient(135deg, \${bgColors[1]}, \${bgColors[2]}, \${bgColors[3]}, \${bgColors[0]})\`;
            const gradient3 = \`linear-gradient(225deg, \${bgColors[2]}, \${bgColors[3]}, \${bgColors[0]}, \${bgColors[1]})\`;
            
            gradientLayer1.style.background = gradient1;
            gradientLayer2.style.background = gradient2;
            gradientLayer3.style.background = gradient3;
        }
        
        // 事件监听
        playBtn.addEventListener('click', togglePlayPause);
        
        prevBtn.addEventListener('click', () => {
            audioPlayer.currentTime = 0;
            updateProgress();
        });
        
        nextBtn.addEventListener('click', () => {
            // 这里可以添加播放下一首的功能
            window.location.href = '/';
        });
        
        progressBar.addEventListener('click', function(e) {
            if (!audioPlayer.duration) return;
            
            const rect = this.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            audioPlayer.currentTime = percent * audioPlayer.duration;
            updateProgress();
        });
        
        // 音频事件监听
        audioPlayer.addEventListener('loadedmetadata', function() {
            updateDuration();
        });
        
        audioPlayer.addEventListener('timeupdate', updateProgress);
        
        audioPlayer.addEventListener('ended', function() {
            isPlaying = false;
            playIcon.className = 'fas fa-play';
            // 可以在这里添加自动播放下一首
        });
        
        // 播放/暂停
        function togglePlayPause() {
            if (!audioPlayer.src) return;
            
            if (isPlaying) {
                pauseAudio();
            } else {
                playAudio();
            }
        }
        
        function playAudio() {
            audioPlayer.play();
            isPlaying = true;
            playIcon.className = 'fas fa-pause';
        }
        
        function pauseAudio() {
            audioPlayer.pause();
            isPlaying = false;
            playIcon.className = 'fas fa-play';
        }
        
        function updateProgress() {
            if (!audioPlayer.duration || audioPlayer.duration === Infinity) return;
            
            const percent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
            progress.style.width = \`\${percent}%\`;
            currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
        }
        
        function updateDuration() {
            if (!audioPlayer.duration || audioPlayer.duration === Infinity) {
                durationEl.textContent = "0:00";
                return;
            }
            
            durationEl.textContent = formatTime(audioPlayer.duration);
        }
        
        function formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return \`\${mins}:\${secs < 10 ? '0' : ''}\${secs}\`;
        }
        
        function showLoading(text) {
            loadingText.textContent = text;
            loading.classList.add('active');
        }
        
        function hideLoading() {
            setTimeout(() => {
                loading.classList.remove('active');
            }, 300);
        }
        
        // 键盘快捷键
        document.addEventListener('keydown', function(e) {
            switch(e.code) {
                case 'Space':
                    e.preventDefault();
                    togglePlayPause();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 10);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    audioPlayer.currentTime = Math.min(audioPlayer.duration, audioPlayer.currentTime + 10);
                    break;
            }
        });
        
        // 初始化
        document.addEventListener('DOMContentLoaded', loadSong);
    </script>
</body>
</html>`;
