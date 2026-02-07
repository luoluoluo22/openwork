---
name: jianying-editor
description: 剪映 (JianYing) AI自动化剪辑的高级封装 API (JyWrapper)。提供开箱即用的 Python 接口，支持录屏、素材导入、字幕生成、Web 动效合成及项目导出�?
---

# JianYing Editor Skill

Use this skill when the user wants to automate video editing, generate drafts, or manipulate media assets in JianYing Pro.

##  运行环境 (Environment)

- **Python Runtime**: 本应用已内置 Python 环境。系统已自动将内置路径加入环境变量�?
- **执行逻辑**: 请直接使�?`python` 调用脚本。如果执行失败（例如提示找不到模块），再尝试调用 `get_python_path` 获取绝对路径并重试�?

##  规则指南 (Rules)

Read the individual rule files for specific tasks and constraints:

- [rules/setup.md](rules/setup.md) - **Mandatory** initialization code for all scripts.
- [rules/core.md](rules/core.md) - Core operations: Saving, Exporting, and Draft management.
- [rules/media.md](rules/media.md) - Importing Video, Audio, and Image assets.
- [rules/text.md](rules/text.md) - Adding Subtitles, Text, and Captions.
- [rules/keyframes.md](rules/keyframes.md) - **Advanced**: Adding Keyframe animations.
- [rules/effects.md](rules/effects.md) - Searching for and applying Filters, Effects, and Transitions.
- [rules/recording.md](rules/recording.md) - **New**: Screen Recording & Smart Zoom automation.
- [rules/web-vfx.md](rules/web-vfx.md) - Advanced: Web-to-Video generation.
- [rules/generative.md](rules/generative.md) - Chain of Thought for generative editing.
- [rules/audio-voice.md](rules/audio-voice.md) - **New**: TTS Voiceover & BGM sourcing.

## 📖 经典示例 (Examples)

Refer to these for complete workflows:
- [examples/my_first_vlog.py](examples/my_first_vlog.py) - A complete vlog creation demo with background music and animated text.
- [examples/simple_clip_demo.py](examples/simple_clip_demo.py) - Quick-start tutorial for basic cutting and track management.
- [examples/compound_clip_demo.py](examples/compound_clip_demo.py) - **New**: Professional nested project (Compound Clip) automation.

## 🧠 提示词与集成工具 (Prompts & Integrated Tools)

Use these templates and scripts for complex tasks:
- **Asset Search**: Find filters, transitions, and animations by Chinese/English name:
  ```bash
  python <SKILL_ROOT>/scripts/asset_search.py "复古" -c filters
  ```
- **Movie Commentary Builder**: Generate 60s commentary videos from a storyboard JSON:
  ```bash
  python <SKILL_ROOT>/scripts/movie_commentary_builder.py --video "video.mp4" --json "storyboard.json"
  ```
- **Sync Native Assets**: Import your favorited/played BGM from JianYing App to the Skill:
  ```bash
  python <SKILL_ROOT>/scripts/sync_jy_assets.py
  ```
- **README to Tutorial**: Convert a project's README.md into a full installation tutorial video script:
  - Read prompt: `prompts/readme_to_tutorial.md`
  - Inject content into `{{README_CONTENT}}` variable
- **Screen Recorder & Smart Zoom**: Record your screen and auto-apply zoom keyframes:
  ```bash
  python <SKILL_ROOT>/tools/recording/recorder.py
  # Or apply zoom to existing video:
  python <SKILL_ROOT>/scripts/jy_wrapper.py apply-zoom --name "Project" --video "v.mp4" --json "e.json"
  ```
- **Auto Exporter**: Headless export of a draft to MP4/SRT:
  ```bash
  python <SKILL_ROOT>/scripts/auto_exporter.py "DraftName" "output.mp4" --res 1080 --fps 60
  # For SRT only:
  python <SKILL_ROOT>/scripts/jy_wrapper.py export-srt --name "DraftName"
  ```
- **Template Clone & Replacer**: 安全克隆模板并批量替换物�?(防止损坏原模�?:
  ```bash
  # 克隆模板生成新项�?
  python <SKILL_ROOT>/scripts/jy_wrapper.py clone --template "酒店模板" --name "客户A_副本"
  ```
- **API Validator**: Run a quick diagnostic of your environment:
  ```bash
  python <SKILL_ROOT>/scripts/api_validator.py
  ```

## 🚀 快速开始示�?

```python
import os
import sys

# 1. 环境初始�?(必须同步到脚本开�?
current_dir = os.path.dirname(os.path.abspath(__file__))
# 探测 Skill 路径 (支持 Antigravity, Trae, Claude �?
skill_root = next((p for p in [
    os.path.join(current_dir, ".agent", "skills", "jianying-editor"),
    os.path.join(current_dir, "skills", "jianying-editor"),
    os.path.abspath(".agent/skills/jianying-editor"),
    os.path.dirname(current_dir) # 如果�?examples/ 目录�?
] if os.path.exists(os.path.join(p, "scripts", "jy_wrapper.py"))), None)

if not skill_root: raise ImportError("Could not find jianying-editor skill root.")
sys.path.insert(0, os.path.join(skill_root, "scripts"))
from jy_wrapper import JyProject

if __name__ == "__main__":
    project = JyProject("My Video Project")
    assets_dir = os.path.join(skill_root, "assets")

    # 2. 导入视频与配�?
    project.add_media_safe(os.path.join(assets_dir, "video.mp4"), "0s")
    project.add_media_safe(os.path.join(assets_dir, "audio.mp3"), "0s", track_name="Audio")

    # 3. 添加带动画的标题
    project.add_text_simple("剪映自动化开�?, start_time="1s", duration="3s", anim_in="复古打字�?)

    project.save()
```
