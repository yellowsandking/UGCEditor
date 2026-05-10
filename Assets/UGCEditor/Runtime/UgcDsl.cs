using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using UnityEngine;

namespace UGCEditor
{
    [Serializable]
    public class UgcMeta
    {
        public string title = "未命名场景";
        public string description = "";
    }

    [Serializable]
    public class UgcCanvas
    {
        public float width = 640f;
        public float height = 480f;
        public string background = "#1a1d23";
    }

    [Serializable]
    public class UgcNode
    {
        public string type = "text";
        public string id = "node";
        public float x;
        public float y;
        public float z;
        public string content = "";
        public float fontSize = 16f;
        public string color = "#e8eaed";
        public float width = 120f;
        public float height = 40f;
        public string fill = "#3d4451";
        public float radius;
        public string label = "按钮";
        public string actionId = "click_node";
    }

    [Serializable]
    public class UgcDocument
    {
        public int version = UgcDsl.Version;
        public UgcMeta meta = new UgcMeta();
        public UgcCanvas canvas = new UgcCanvas();
        public List<UgcNode> nodes = new List<UgcNode>();
    }

    public enum UgcRenderKind
    {
        Rect,
        Text,
        Button
    }

    [Serializable]
    public class UgcRenderOp
    {
        public UgcRenderKind kind;
        public string id;
        public float z;
        public float x;
        public float y;
        public float width;
        public float height;
        public string fill;
        public float radius;
        public string content;
        public float fontSize;
        public string color;
        public string label;
        public string actionId;
    }

    [Serializable]
    public class UgcCompiledProgram
    {
        public UgcCanvas canvas = new UgcCanvas();
        public List<UgcRenderOp> ops = new List<UgcRenderOp>();
    }

    public struct UgcValidationIssue
    {
        public string path;
        public string message;

        public UgcValidationIssue(string path, string message)
        {
            this.path = path;
            this.message = message;
        }
    }

    public static class UgcDsl
    {
        public const int Version = 1;

        private static readonly Regex IdPattern = new Regex(
            "^[a-zA-Z][a-zA-Z0-9_-]{0,63}$",
            RegexOptions.Compiled
        );

        public static UgcDocument EmptyDocument()
        {
            return new UgcDocument();
        }

        public static UgcDocument MockFromPrompt(string prompt)
        {
            UgcDocument doc = EmptyDocument();
            string safePrompt = prompt ?? "";
            string lower = safePrompt.ToLowerInvariant();
            doc.meta.title = "LLM 草稿";
            doc.meta.description = safePrompt.Length > 200 ? safePrompt.Substring(0, 200) : safePrompt;
            doc.canvas.background = lower.Contains("暗") || lower.Contains("dark") || lower.Contains("夜")
                ? "#0d1117"
                : "#1a1d23";
            if (lower.Contains("蓝") || lower.Contains("blue"))
            {
                doc.canvas.background = "#0c1929";
            }

            doc.nodes.Add(new UgcNode
            {
                type = "rect",
                id = "bg_panel",
                x = 40f,
                y = 40f,
                z = 0f,
                width = doc.canvas.width - 80f,
                height = doc.canvas.height - 80f,
                fill = "#252a33",
                radius = 12f
            });
            doc.nodes.Add(new UgcNode
            {
                type = "text",
                id = "title",
                x = 64f,
                y = 64f,
                z = 1f,
                content = string.IsNullOrWhiteSpace(safePrompt)
                    ? "在此输入创意描述"
                    : "主题：" + (safePrompt.Length > 80 ? safePrompt.Substring(0, 80) : safePrompt),
                fontSize = 22f,
                color = "#f0f3f8"
            });
            doc.nodes.Add(new UgcNode
            {
                type = "text",
                id = "hint",
                x = 64f,
                y = 120f,
                z = 1f,
                content = "（C# 版离线模板：未接入云端 LLM。）",
                fontSize = 14f,
                color = "#9aa0a6"
            });
            doc.nodes.Add(new UgcNode
            {
                type = "button",
                id = "btn_play",
                x = 64f,
                y = doc.canvas.height - 100f,
                z = 2f,
                width = 140f,
                height = 44f,
                label = "开始",
                actionId = "game_start"
            });
            doc.nodes.Add(new UgcNode
            {
                type = "button",
                id = "btn_share",
                x = 220f,
                y = doc.canvas.height - 100f,
                z = 2f,
                width = 140f,
                height = 44f,
                label = "分享",
                actionId = "share"
            });

            return doc;
        }

        public static bool TryParseJson(string json, out UgcDocument document, out string error)
        {
            try
            {
                document = JsonUtility.FromJson<UgcDocument>(json);
            }
            catch (Exception ex)
            {
                document = null;
                error = ex.Message;
                return false;
            }

            if (document == null)
            {
                error = "JSON 解析失败";
                return false;
            }

            Normalize(document);
            List<UgcValidationIssue> issues = Validate(document);
            if (issues.Count > 0)
            {
                error = FormatIssues(issues);
                return false;
            }

            error = "";
            return true;
        }

        public static string ToJson(UgcDocument document, bool prettyPrint)
        {
            Normalize(document);
            return JsonUtility.ToJson(document, prettyPrint);
        }

        public static List<UgcValidationIssue> Validate(UgcDocument document)
        {
            List<UgcValidationIssue> issues = new List<UgcValidationIssue>();
            if (document == null)
            {
                issues.Add(new UgcValidationIssue("", "根须为 JSON 对象"));
                return issues;
            }

            Normalize(document);
            if (document.version != Version)
            {
                issues.Add(new UgcValidationIssue("version", "version 须为 " + Version));
            }

            if (document.meta == null || string.IsNullOrWhiteSpace(document.meta.title))
            {
                issues.Add(new UgcValidationIssue("meta.title", "meta.title 须为非空字符串"));
            }

            if (document.canvas == null)
            {
                issues.Add(new UgcValidationIssue("canvas", "须包含 canvas 对象"));
            }
            else
            {
                if (!IsPositiveFinite(document.canvas.width))
                {
                    issues.Add(new UgcValidationIssue("canvas.width", "须为正数"));
                }

                if (!IsPositiveFinite(document.canvas.height))
                {
                    issues.Add(new UgcValidationIssue("canvas.height", "须为正数"));
                }
            }

            HashSet<string> seen = new HashSet<string>();
            for (int i = 0; i < document.nodes.Count; i++)
            {
                ValidateNode(document.nodes[i], i, seen, issues);
            }

            return issues;
        }

        public static UgcCompiledProgram Compile(UgcDocument document)
        {
            Normalize(document);
            UgcCompiledProgram program = new UgcCompiledProgram();
            program.canvas.width = document.canvas.width;
            program.canvas.height = document.canvas.height;
            program.canvas.background = string.IsNullOrWhiteSpace(document.canvas.background)
                ? "#1a1d23"
                : document.canvas.background;

            for (int i = 0; i < document.nodes.Count; i++)
            {
                UgcNode node = document.nodes[i];
                UgcRenderOp op = new UgcRenderOp
                {
                    id = node.id,
                    z = node.z,
                    x = node.x,
                    y = node.y
                };

                if (node.type == "rect")
                {
                    op.kind = UgcRenderKind.Rect;
                    op.width = node.width;
                    op.height = node.height;
                    op.fill = string.IsNullOrWhiteSpace(node.fill) ? "#3d4451" : node.fill;
                    op.radius = Mathf.Max(0f, node.radius);
                }
                else if (node.type == "button")
                {
                    op.kind = UgcRenderKind.Button;
                    op.width = node.width;
                    op.height = node.height;
                    op.label = node.label;
                    op.actionId = node.actionId;
                }
                else
                {
                    op.kind = UgcRenderKind.Text;
                    op.content = node.content;
                    op.fontSize = node.fontSize > 0f ? node.fontSize : 16f;
                    op.color = string.IsNullOrWhiteSpace(node.color) ? "#e8eaed" : node.color;
                }

                program.ops.Add(op);
            }

            program.ops.Sort((a, b) => a.z.CompareTo(b.z));
            return program;
        }

        public static string FormatIssues(List<UgcValidationIssue> issues)
        {
            List<string> lines = new List<string>();
            for (int i = 0; i < issues.Count; i++)
            {
                lines.Add(issues[i].path + ": " + issues[i].message);
            }

            return string.Join("\n", lines.ToArray());
        }

        public static Color ParseColor(string cssColor, Color fallback)
        {
            Color parsed;
            return ColorUtility.TryParseHtmlString(cssColor, out parsed) ? parsed : fallback;
        }

        public static void Normalize(UgcDocument document)
        {
            if (document == null)
            {
                return;
            }

            if (document.meta == null)
            {
                document.meta = new UgcMeta();
            }

            if (document.canvas == null)
            {
                document.canvas = new UgcCanvas();
            }

            if (document.nodes == null)
            {
                document.nodes = new List<UgcNode>();
            }
        }

        private static void ValidateNode(
            UgcNode node,
            int index,
            HashSet<string> seen,
            List<UgcValidationIssue> issues
        )
        {
            string path = "nodes[" + index + "]";
            if (node == null)
            {
                issues.Add(new UgcValidationIssue(path, "节点必须是对象"));
                return;
            }

            if (string.IsNullOrWhiteSpace(node.id) || !IdPattern.IsMatch(node.id))
            {
                issues.Add(new UgcValidationIssue(path + ".id", "id 须为非空字符串，建议字母开头，仅含字母数字与 _-"));
            }
            else if (seen.Contains(node.id))
            {
                issues.Add(new UgcValidationIssue(path + ".id", "重复的 id: " + node.id));
            }
            else
            {
                seen.Add(node.id);
            }

            if (!IsFinite(node.x))
            {
                issues.Add(new UgcValidationIssue(path + ".x", "x 须为有限数字"));
            }

            if (!IsFinite(node.y))
            {
                issues.Add(new UgcValidationIssue(path + ".y", "y 须为有限数字"));
            }

            if (!IsFinite(node.z))
            {
                issues.Add(new UgcValidationIssue(path + ".z", "z 须为有限数字"));
            }

            if (node.type == "text")
            {
                if (node.content == null)
                {
                    issues.Add(new UgcValidationIssue(path + ".content", "text 须含 content 字符串"));
                }

                if (node.fontSize <= 0f || !IsFinite(node.fontSize))
                {
                    issues.Add(new UgcValidationIssue(path + ".fontSize", "fontSize 须为正数"));
                }
            }
            else if (node.type == "rect")
            {
                ValidateSize(node, path, issues);
                if (node.radius < 0f || !IsFinite(node.radius))
                {
                    issues.Add(new UgcValidationIssue(path + ".radius", "radius 须为非负数"));
                }
            }
            else if (node.type == "button")
            {
                ValidateSize(node, path, issues);
                if (string.IsNullOrWhiteSpace(node.label))
                {
                    issues.Add(new UgcValidationIssue(path + ".label", "button 须含非空 label"));
                }

                if (string.IsNullOrWhiteSpace(node.actionId) || !IdPattern.IsMatch(node.actionId))
                {
                    issues.Add(new UgcValidationIssue(path + ".actionId", "actionId 须为合法标识符"));
                }
            }
            else
            {
                issues.Add(new UgcValidationIssue(path + ".type", "未知类型: " + node.type));
            }
        }

        private static void ValidateSize(UgcNode node, string path, List<UgcValidationIssue> issues)
        {
            if (!IsPositiveFinite(node.width))
            {
                issues.Add(new UgcValidationIssue(path + ".width", "width 须为正数"));
            }

            if (!IsPositiveFinite(node.height))
            {
                issues.Add(new UgcValidationIssue(path + ".height", "height 须为正数"));
            }
        }

        private static bool IsPositiveFinite(float value)
        {
            return IsFinite(value) && value > 0f;
        }

        private static bool IsFinite(float value)
        {
            return !float.IsNaN(value) && !float.IsInfinity(value);
        }
    }
}
