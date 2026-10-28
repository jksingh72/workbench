/**
 * Python Introspection Script
 *
 * Self-contained, zero-dependency Python script executed via `uv run` to inspect
 * any installed or local Python package. Extracts version metadata, exported modules,
 * classes, methods, functions, type signatures, docstrings, and dependency requirements.
 */

export const UV_INTROSPECT_SCRIPT = `
import sys
import json
import inspect
import importlib
import importlib.metadata
import pkgutil
from typing import Any, Dict, List

def safe_str(val: Any) -> str:
    try:
        return str(val)
    except Exception:
        return ""

def get_metadata(package_name: str) -> Dict[str, Any]:
    meta: Dict[str, Any] = {
        "name": package_name,
        "version": "unknown",
        "summary": "",
        "author": "",
        "license": "",
        "homepage": "",
        "dependencies": []
    }
    try:
        dist = importlib.metadata.distribution(package_name)
        metadata = dist.metadata
        meta["version"] = metadata.get("Version", "unknown")
        meta["summary"] = metadata.get("Summary", "")
        meta["author"] = metadata.get("Author", "") or metadata.get("Author-email", "")
        meta["license"] = metadata.get("License", "")
        meta["homepage"] = metadata.get("Home-page", "") or metadata.get("Project-URL", "")
        if dist.requires:
            meta["dependencies"] = [req.split(";")[0].strip() for req in dist.requires if req]
    except Exception:
        # Fallback if package is not a distribution or metadata unreadable
        pass
    return meta

def inspect_function(func: Any, name: str, mod_name: str) -> Dict[str, Any]:
    info: Dict[str, Any] = {
        "name": name,
        "module": mod_name,
        "docstring": inspect.getdoc(func) or "",
        "signature": "",
        "parameters": [],
        "returnType": ""
    }
    try:
        sig = inspect.signature(func)
        info["signature"] = f"{name}{sig}"
        params = []
        for p_name, param in sig.parameters.items():
            param_info = {
                "name": p_name,
                "kind": str(param.kind.name) if hasattr(param.kind, "name") else str(param.kind),
                "annotation": safe_str(param.annotation) if param.annotation != inspect.Parameter.empty else "",
                "default": safe_str(param.default) if param.default != inspect.Parameter.empty else ""
            }
            params.append(param_info)
        info["parameters"] = params
        if sig.return_annotation != inspect.Signature.empty:
            info["returnType"] = safe_str(sig.return_annotation)
    except Exception:
        info["signature"] = f"{name}(...)"
    return info

def inspect_class(cls: Any, name: str, mod_name: str) -> Dict[str, Any]:
    info: Dict[str, Any] = {
        "name": name,
        "module": mod_name,
        "docstring": inspect.getdoc(cls) or "",
        "bases": [b.__name__ for b in cls.__bases__ if b.__name__ != "object"],
        "methods": []
    }
    try:
        for m_name, m_val in inspect.getmembers(cls):
            if m_name.startswith("__") and m_name not in ("__init__", "__call__"):
                continue
            if inspect.isfunction(m_val) or inspect.ismethod(m_val):
                info["methods"].append(inspect_function(m_val, m_name, mod_name))
    except Exception:
        pass
    return info

def analyze_package(package_name: str) -> Dict[str, Any]:
    result: Dict[str, Any] = {
        "package": package_name,
        "metadata": get_metadata(package_name),
        "modules": [],
        "classes": [],
        "functions": [],
        "constants": []
    }

    try:
        mod = importlib.import_module(package_name)
    except Exception as e:
        result["error"] = f"Failed to import package '{package_name}': {safe_str(e)}"
        return result

    # Find submodules if it's a package
    if hasattr(mod, "__path__"):
        try:
            for _, subname, ispkg in pkgutil.iter_modules(mod.__path__):
                result["modules"].append({
                    "name": subname,
                    "isPackage": ispkg
                })
        except Exception:
            pass

    seen_classes = set()
    seen_functions = set()

    def process_module_members(m: Any, mod_full_name: str):
        symbols = []
        if hasattr(m, "__all__") and isinstance(m.__all__, (list, tuple)):
            symbols = [(name, getattr(m, name, None)) for name in m.__all__ if hasattr(m, name)]
        else:
            try:
                symbols = inspect.getmembers(m)
            except Exception:
                symbols = []

        for name, obj in symbols:
            if name.startswith("_"):
                continue
            try:
                if inspect.isclass(obj):
                    obj_mod = getattr(obj, "__module__", "") or ""
                    # Keep class if it belongs to package, subpackages, or imported without external pollution
                    if not (obj_mod.startswith(package_name) or obj_mod == ""):
                        continue
                    class_key = f"{obj_mod}.{name}"
                    if class_key in seen_classes:
                        continue
                    seen_classes.add(class_key)
                    result["classes"].append(inspect_class(obj, name, mod_full_name))
                elif inspect.isfunction(obj) or inspect.isbuiltin(obj):
                    obj_mod = getattr(obj, "__module__", "") or ""
                    if not (obj_mod.startswith(package_name) or obj_mod == ""):
                        continue
                    func_key = f"{obj_mod}.{name}"
                    if func_key in seen_functions:
                        continue
                    seen_functions.add(func_key)
                    result["functions"].append(inspect_function(obj, name, mod_full_name))
                elif mod_full_name == package_name and not inspect.ismodule(obj):
                    val_repr = safe_str(obj)
                    if len(val_repr) > 100:
                        val_repr = val_repr[:97] + "..."
                    result["constants"].append({
                        "name": name,
                        "type": type(obj).__name__,
                        "value": val_repr
                    })
            except Exception:
                continue

    # 1. Inspect top-level module members
    process_module_members(mod, package_name)

    # 2. Inspect first-level public submodules (e.g. langchain.agents, langchain.tools)
    submodules_to_scan = [sm["name"] for sm in result["modules"] if not sm["name"].startswith("_")][:30]
    for subname in submodules_to_scan:
        sub_full_name = f"{package_name}.{subname}"
        try:
            submod = importlib.import_module(sub_full_name)
            process_module_members(submod, sub_full_name)
        except Exception:
            continue

    result["classes"] = result["classes"][:150]
    result["functions"] = result["functions"][:100]
    result["constants"] = result["constants"][:50]
    return result

if __name__ == "__main__":
    pkg = sys.argv[1] if len(sys.argv) > 1 else ""
    if not pkg:
        print(json.dumps({"error": "No package name provided"}))
        sys.exit(1)
    data = analyze_package(pkg)
    print(json.dumps(data))
`.trim()
