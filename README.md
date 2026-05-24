# PyLingual 中文增强版

[![License](https://img.shields.io/badge/license-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0.html)
[![Python](https://img.shields.io/badge/python-3.12+-blue.svg)](https://www.python.org/downloads/)

基于深度学习的 Python 字节码反编译器，支持 Python 3.6 至 3.13 全版本，将 `.pyc` 文件还原为可读的 Python 源代码。

基于 [syssec-utd/pylingual](https://github.com/syssec-utd/pylingual) 上游开发，增加了中文 Web 界面 (PyXray)、时间感知主题系统、华为昇腾 NPU 支持等功能。

## ✨ 特性

- **全版本覆盖**：支持 Python 3.6 – 3.13 共 8 个大版本的字节码反编译
- **四阶段 AI 流水线**：Disassembly → Translation → AST Masking → Statement Generation
- **PyXray Web 界面**：X-RAY LAB 法医终端风格，实时 WebSocket 四阶段进度反馈
- **时间感知主题**：6 段配色（夜/黎明/上午/正午/午后/黄昏）随系统时间平滑切换
- **多设备支持**：自动检测并优先使用 华为昇腾 NPU → CUDA → MPS → CPU
- **CLI 批量处理**：支持通配符批量输入，可配置输出目录与置信度阈值

## 📦 安装

### 1. 克隆仓库

```bash
git clone https://github.com/SkychenLee/pylingual.git
cd pylingual
```

### 2. 创建虚拟环境

```bash
python -m venv venv
source venv/bin/activate        # Linux/macOS
# venv\Scripts\activate         # Windows (PowerShell)
```

### 3. 安装核心包

```bash
pip install -e .
```

> 项目使用 setuptools 构建，`pip install -e .` 会安装所有依赖（PyTorch、Transformers 4.46.1 等）。

### 4. 安装 Web 界面依赖（可选）

```bash
pip install -r web_app/requirements.txt
```

Web 依赖额外需要：FastAPI、uvicorn、websockets、python-multipart、rich、pyyaml。

### 前端开发环境（可选）

如需修改前端界面，可进入 `web/` 目录使用 Vite 开发服务器：

```bash
cd web
npm install
npm run dev          # 开发模式，端口 5173
npm run build        # 构建生产版本至 web_app/static/
```

## 🚀 使用方式

### CLI 命令行

```bash
pylingual [OPTIONS] [FILES]...
```

| 选项 | 说明 |
|------|------|
| `-o, --out-dir PATH` | 输出目录（默认 `./decompiled/`） |
| `-c, --config-file PATH` | 模型配置文件路径 |
| `-v, --version VERSION` | Python 版本（默认自动检测） |
| `-k, --top-k INT` | 最大分段候选数量 |
| `-q, --quiet` | 安静模式，隐藏 Rich 进度输出 |
| `--trust-lnotab` | 使用 lnotab 替代分段模型进行分段 |
| `--init-pyenv` | 自动安装 pyenv（等价性检查所需） |
| `-h, --help` | 显示帮助信息 |

**示例：**

```bash
# 单个文件
pylingual test.pyc

# 批量处理，指定输出目录
pylingual -o results/ *.pyc

# 指定 Python 版本
pylingual -v 3.10 test.pyc
```

### Web 界面 (PyXray)

```bash
# 方式一：通过 CLI 入口
pylingual serve [--port 8000]

# 方式二：直接启动 FastAPI
uvicorn web_app.app:app --host 0.0.0.0 --port 8000
```

启动后访问 http://localhost:8000 ，上传 `.pyc` 文件即可反编译。

Web 特性：
- 实时四阶段进度条（解析 → 翻译 → 语法分析 → 生成）
- 6 段自动切换时间配色（夜间护眼模式、金色午后、紫色黄昏等）
- 代码高亮（Night Owl 暗色主题）

## 📁 项目结构

```
pylingual/
├── pylingual/              # 核心反编译库
│   ├── main.py             #   CLI 入口 (Click)
│   ├── decompiler.py       #   主反编译逻辑
│   ├── models.py           #   模型加载与设备选择 (NPU/CUDA/MPS/CPU)
│   ├── decompiler_config.yaml  #   各版本模型配置
│   ├── editable_bytecode/  #   字节码编辑与重写模块
│   ├── masking/            #   AST 掩码与指令掩码
│   └── ...
├── web_app/                # FastAPI Web 后端
│   ├── app.py              #   FastAPI 应用 + WebSocket 进度推送
│   ├── static/             #   Vite 构建产物
│   └── requirements.txt    #   Web 依赖
├── web/                    # React 前端源码 (Vite)
│   ├── src/
│   │   ├── App.jsx         #   主界面（时钟、主题、上传、结果）
│   │   ├── App.css         #   X-RAY LAB 样式 + 时间主题系统
│   │   └── ...
│   ├── package.json
│   └── vite.config.js
├── test/                   # 测试用例
├── dev_scripts/            # 开发与调试脚本
├── pyproject.toml          # 项目配置（setuptools）
└── LICENSE                 # GPL-3.0
```

## ⚙️ 技术栈

| 组件 | 技术 |
|------|------|
| 后端框架 | FastAPI + WebSocket |
| 前端框架 | React 18 + Vite |
| AI 模型 | HuggingFace Transformers 4.46.1 + PyTorch |
| 代码高亮 | prism-react-renderer (Night Owl) |
| CLI | Click + Rich |
| 字体 | JetBrains Mono 0.901 + Outfit |

## 🔧 设备选择

PyLingual 自动检测可用计算设备，优先级：

```
华为昇腾 NPU (torch_npu) → NVIDIA CUDA → Apple MPS → CPU
```

如需使用昇腾 NPU，需确保已安装 [CANN Toolkit](https://www.hiascend.com/software/cann) 和 `torch_npu` 包。

## 📄 许可证

本项目采用 [GPL-3.0-only](LICENSE) 开源许可。

## 📚 引用

如果在研究中使用了 PyLingual，请引用：

```bibtex
@inproceedings{pan2025pylingual,
  title     = {PyLingual: An AI-Based Python Bytecode Decompiler},
  author    = {Pan, Rui and Zhang, Yiyi and Zhang, Shouling and Wang, Zhe and Song, Dawn},
  booktitle = {USENIX Security Symposium},
  year      = {2025}
}
```

## 🙏 致谢

- 原始项目 [syssec-utd/pylingual](https://github.com/syssec-utd/pylingual) — USENIX Security '25
- [xdis](https://github.com/rocky/python-xdis) — Python 字节码反汇编库
- [PyTorch](https://pytorch.org/) & [HuggingFace](https://huggingface.co/) — 深度学习基础设施
