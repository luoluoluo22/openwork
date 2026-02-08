use serde::Serialize;
use tauri::Manager;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use crate::paths::{candidate_xdg_config_dirs, home_dir};
use crate::types::ExecResult;

fn ensure_project_skill_root(project_dir: &str) -> Result<PathBuf, String> {
    let project_dir = project_dir.trim();
    if project_dir.is_empty() {
        return Err("projectDir is required".to_string());
    }

    let base = PathBuf::from(project_dir).join(".opencode");
    let legacy = base.join("skill");
    let modern = base.join("skills");

    if legacy.is_dir() && !modern.exists() {
        fs::rename(&legacy, &modern).map_err(|e| {
            format!(
                "Failed to move {} -> {}: {e}",
                legacy.display(),
                modern.display()
            )
        })?;
    }

    fs::create_dir_all(&modern)
        .map_err(|e| format!("Failed to create {}: {e}", modern.display()))?;
    Ok(modern)
}

fn collect_project_skill_roots(project_dir: &Path) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let mut current = Some(project_dir);

    while let Some(dir) = current {
        let opencode_root = dir.join(".opencode").join("skills");
        if opencode_root.is_dir() {
            roots.push(opencode_root);
        } else {
            let legacy_root = dir.join(".opencode").join("skill");
            if legacy_root.is_dir() {
                roots.push(legacy_root);
            }
        }

        let claude_root = dir.join(".claude").join("skills");
        if claude_root.is_dir() {
            roots.push(claude_root);
        }

        if dir.join(".git").exists() {
            break;
        }

        current = dir.parent();
    }

    roots
}

fn collect_global_skill_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    for dir in candidate_xdg_config_dirs() {
        let opencode_root = dir.join("opencode").join("skills");
        if opencode_root.is_dir() {
            roots.push(opencode_root);
        }
    }

    if let Some(home) = home_dir() {
        let claude_root = home.join(".claude").join("skills");
        if claude_root.is_dir() {
            roots.push(claude_root);
        }
    }

    roots
}

fn collect_skill_roots(app: &tauri::AppHandle, project_dir: &str) -> Result<Vec<PathBuf>, String> {
    let project_dir = project_dir.trim();
    if project_dir.is_empty() {
        return Err("projectDir is required".to_string());
    }

    let mut roots = Vec::new();

    // 1. 优先添加项目特定目录 (让本地开发版本可以覆盖内置版本)
    let project_path = PathBuf::from(project_dir);
    roots.extend(collect_project_skill_roots(&project_path));

    // 2. 添加全局目录
    roots.extend(collect_global_skill_roots());

    // 3. 最后添加内置技能目录作为兜底 (Tauri Resources)
    if let Ok(resource_dir) = app.path().resource_dir() {
        let built_in_root = resource_dir.join("resources").join("built-in-skills");
        if built_in_root.is_dir() {
            roots.push(built_in_root);
        }
    }

    let mut seen = HashSet::new();
    let mut unique = Vec::new();
    for root in roots {
        let key = root.to_string_lossy().to_string();
        if seen.insert(key) {
            unique.push(root);
        }
    }

    Ok(unique)
}

fn validate_skill_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("skill name is required".to_string());
    }

    if !trimmed
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err("skill name must be kebab-case".to_string());
    }

    if trimmed.starts_with('-') || trimmed.ends_with('-') || trimmed.contains("--") {
        return Err("skill name must be kebab-case".to_string());
    }

    Ok(trimmed.to_string())
}

fn gather_skills(
    root: &Path,
    seen: &mut HashSet<String>,
    out: &mut Vec<PathBuf>,
) -> Result<(), String> {
    if !root.is_dir() {
        return Ok(());
    }

    for entry in
        fs::read_dir(root).map_err(|e| format!("Failed to read {}: {e}", root.display()))?
    {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if !file_type.is_dir() {
            continue;
        }

        let path = entry.path();
        if !path.join("SKILL.md").is_file() {
            continue;
        }

        let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
            continue;
        };

        if seen.insert(name.to_string()) {
            out.push(path);
        }
    }

    Ok(())
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LocalSkillCard {
    pub name: String,
    pub path: String,
    pub description: Option<String>,
    pub trigger: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LocalSkillContent {
    pub path: String,
    pub content: String,
}

fn extract_frontmatter_value(raw: &str, keys: &[&str]) -> Option<String> {
    let mut lines = raw.lines();
    let first = lines.next()?.trim();
    if first != "---" {
        return None;
    }

    for line in lines {
        let trimmed = line.trim();
        if trimmed == "---" {
            break;
        }
        if trimmed.is_empty() {
            continue;
        }
        let Some((key, value)) = trimmed.split_once(':') else {
            continue;
        };
        if !keys
            .iter()
            .any(|candidate| candidate.eq_ignore_ascii_case(key.trim()))
        {
            continue;
        }
        let mut cleaned = value.trim().to_string();
        if (cleaned.starts_with('"') && cleaned.ends_with('"'))
            || (cleaned.starts_with('\'') && cleaned.ends_with('\''))
        {
            if cleaned.len() >= 2 {
                cleaned = cleaned[1..cleaned.len() - 1].to_string();
            }
        }
        let cleaned = cleaned.trim();
        if cleaned.is_empty() {
            continue;
        }
        return Some(cleaned.to_string());
    }

    None
}

fn extract_trigger(raw: &str) -> Option<String> {
    if let Some(frontmatter) = extract_frontmatter_value(raw, &["trigger", "when"]) {
        return Some(frontmatter);
    }

    let mut in_frontmatter = false;
    let mut in_when_section = false;

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed == "---" {
            in_frontmatter = !in_frontmatter;
            continue;
        }
        if in_frontmatter {
            continue;
        }
        if trimmed.starts_with('#') {
            let heading = trimmed.trim_start_matches('#').trim();
            in_when_section = heading.eq_ignore_ascii_case("When to use");
            continue;
        }
        if !in_when_section {
            continue;
        }

        let cleaned = trimmed
            .trim_start_matches(|c: char| c == '-' || c == '*' || c == '+')
            .trim_start_matches(|c: char| c.is_whitespace())
            .trim_start_matches(|c: char| c.is_ascii_digit() || c == '.' || c == ')')
            .trim();
        if !cleaned.is_empty() {
            return Some(cleaned.to_string());
        }
    }

    None
}

fn extract_description(raw: &str) -> Option<String> {
    // 优先从 Frontmatter 提取
    if let Some(desc) = extract_frontmatter_value(raw, &["description", "desc"]) {
        return Some(safe_truncate(&desc, 180));
    }

    let mut in_frontmatter = false;

    for line in raw.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed == "---" {
            in_frontmatter = !in_frontmatter;
            continue;
        }
        if in_frontmatter {
            continue;
        }
        if trimmed.starts_with('#') {
            continue;
        }

        let cleaned = trimmed.replace('`', "");
        if cleaned.is_empty() {
            continue;
        }

        return Some(safe_truncate(&cleaned, 180));
    }

    None
}

fn safe_truncate(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        return s.to_string();
    }
    format!("{}...", s.chars().take(max_chars).collect::<String>())
}

#[tauri::command]
pub fn list_local_skills(app: tauri::AppHandle, project_dir: String) -> Result<Vec<LocalSkillCard>, String> {
    let project_dir = project_dir.trim();
    if project_dir.is_empty() {
        return Err("projectDir is required".to_string());
    }

    let skill_roots = collect_skill_roots(&app, project_dir)?;
    let mut found: Vec<PathBuf> = Vec::new();
    let mut seen = HashSet::new();
    for root in skill_roots {
        gather_skills(&root, &mut seen, &mut found)?;
    }

    let mut out = Vec::new();
    for path in found {
        let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
            continue;
        };

        let (description, trigger) = match fs::read_to_string(path.join("SKILL.md")) {
            Ok(raw) => (extract_description(&raw), extract_trigger(&raw)),
            Err(_) => (None, None),
        };

        out.push(LocalSkillCard {
            name: name.to_string(),
            path: path.to_string_lossy().to_string(),
            description,
            trigger,
        });
    }

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[tauri::command]
pub fn read_local_skill(app: tauri::AppHandle, project_dir: String, name: String) -> Result<LocalSkillContent, String> {
    let project_dir = project_dir.trim();
    if project_dir.is_empty() {
        return Err("projectDir is required".to_string());
    }

    let name = validate_skill_name(&name)?;
    let roots = collect_skill_roots(&app, project_dir)?;

    for root in roots {
        let path = root.join(&name).join("SKILL.md");
        if !path.is_file() {
            continue;
        }
        let raw = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read {}: {e}", path.display()))?;
        return Ok(LocalSkillContent {
            path: path.to_string_lossy().to_string(),
            content: raw,
        });
    }

    Err("Skill not found".to_string())
}

#[tauri::command]
pub fn write_local_skill(
    app: tauri::AppHandle,
    project_dir: String,
    name: String,
    content: String,
) -> Result<ExecResult, String> {
    let project_dir = project_dir.trim();
    if project_dir.is_empty() {
        return Err("projectDir is required".to_string());
    }

    let name = validate_skill_name(&name)?;
    let roots = collect_skill_roots(&app, project_dir)?;
    let mut target: Option<PathBuf> = None;

    for root in roots {
        let path = root.join(&name).join("SKILL.md");
        if path.is_file() {
            target = Some(path);
            break;
        }
    }

    let Some(path) = target else {
        return Ok(ExecResult {
            ok: false,
            status: 1,
            stdout: String::new(),
            stderr: "Skill not found".to_string(),
        });
    };

    let next = if content.ends_with('\n') {
        content
    } else {
        format!("{}\n", content)
    };
    fs::write(&path, next).map_err(|e| format!("Failed to write {}: {e}", path.display()))?;

    Ok(ExecResult {
        ok: true,
        status: 0,
        stdout: format!("Saved skill {}", name),
        stderr: String::new(),
    })
}
 
#[tauri::command]
pub fn write_skill_file(
    project_dir: String,
    skill_name: String,
    subsite_path: String,
    content: String,
) -> Result<ExecResult, String> {
    let project_dir = project_dir.trim();
    if project_dir.is_empty() {
        return Err("projectDir is required".to_string());
    }
 
    let skill_name = validate_skill_name(&skill_name)?;
    let skill_root = ensure_project_skill_root(project_dir)?;
    let skill_dir = skill_root.join(&skill_name);
 
    if !skill_dir.exists() {
        fs::create_dir_all(&skill_dir)
            .map_err(|e| format!("Failed to create skill directory {}: {e}", skill_dir.display()))?;
    }
 
    // 防止路径穿越攻击 (Security)
    if subsite_path.contains("..") || subsite_path.starts_with('/') || subsite_path.starts_with('\\') {
        return Err("Invalid subpath".to_string());
    }
 
    let dest_path = skill_dir.join(&subsite_path);
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directory: {e}"))?;
    }
 
    fs::write(&dest_path, content)
        .map_err(|e| format!("Failed to write file {}: {e}", dest_path.display()))?;
 
    Ok(ExecResult {
        ok: true,
        status: 0,
        stdout: format!("Written to {}", subsite_path),
        stderr: String::new(),
    })
}

#[tauri::command]
pub fn install_skill_template(
    project_dir: String,
    name: String,
    content: String,
    overwrite: bool,
) -> Result<ExecResult, String> {
    let project_dir = project_dir.trim();
    if project_dir.is_empty() {
        return Err("projectDir is required".to_string());
    }

    let name = validate_skill_name(&name)?;
    let skill_root = ensure_project_skill_root(project_dir)?;
    let dest = skill_root.join(&name);

    if dest.exists() {
        if overwrite {
            fs::remove_dir_all(&dest).map_err(|e| {
                format!(
                    "Failed to remove existing skill dir {}: {e}",
                    dest.display()
                )
            })?;
        } else {
            return Ok(ExecResult {
                ok: false,
                status: 1,
                stdout: String::new(),
                stderr: format!("Skill already exists at {}", dest.display()),
            });
        }
    }

    fs::create_dir_all(&dest).map_err(|e| format!("Failed to create {}: {e}", dest.display()))?;
    fs::write(dest.join("SKILL.md"), content)
        .map_err(|e| format!("Failed to write SKILL.md: {e}"))?;

    Ok(ExecResult {
        ok: true,
        status: 0,
        stdout: format!("Installed skill to {}", dest.display()),
        stderr: String::new(),
    })
}

#[tauri::command]
pub fn get_python_path(app: tauri::AppHandle) -> Result<String, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {e}"))?;

    let python_exe = resource_dir
        .join("resources")
        .join("python-runtime")
        .join("python.exe");

    if python_exe.exists() {
        Ok(python_exe.to_string_lossy().to_string())
    } else {
        // 兜底返回系统 python
        Ok("python".to_string())
    }
}

#[tauri::command]
pub fn uninstall_skill(app: tauri::AppHandle, project_dir: String, name: String) -> Result<ExecResult, String> {
    let project_dir = project_dir.trim();
    if project_dir.is_empty() {
        return Err("projectDir is required".to_string());
    }

    let name = validate_skill_name(&name)?;
    let skill_roots = collect_skill_roots(&app, project_dir)?;
    let mut removed = false;

    for root in skill_roots {
        let dest = root.join(&name);
        if !dest.exists() {
            continue;
        }

        // 禁止删除内置技能 (Security/Safety)
        if let Ok(resource_dir) = app.path().resource_dir() {
            let built_in_root = resource_dir.join("resources").join("built-in-skills");
            if dest.starts_with(built_in_root) {
                return Err("Cannot uninstall built-in skills".to_string());
            }
        }

        fs::remove_dir_all(&dest)
            .map_err(|e| format!("Failed to remove {}: {e}", dest.display()))?;
        removed = true;
    }

    if !removed {
        return Ok(ExecResult {
            ok: false,
            status: 1,
            stdout: String::new(),
            stderr: "Skill not found in .opencode/skills or .claude/skills".to_string(),
        });
    }

    Ok(ExecResult {
        ok: true,
        status: 0,
        stdout: format!("Removed skill {}", name),
        stderr: String::new(),
    })
}
