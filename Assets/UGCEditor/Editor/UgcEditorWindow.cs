using System.Collections.Generic;
using UnityEditor;
using UnityEditor.UIElements;
using UnityEngine;
using UnityEngine.UIElements;

namespace UGCEditor.Editor
{
    public class UgcEditorWindow : EditorWindow
    {
        private const string UxmlPath = "Assets/UGCEditor/Editor/UgcEditorWindow.uxml";
        private const string UssPath = "Assets/UGCEditor/Editor/UgcEditorWindow.uss";

        private UgcDocument document;
        private string jsonText = "";
        private string prompt = "做一个深色背景的欢迎界面，带标题和两个按钮：开始、分享";
        private string note = "";
        private string validationText = "";
        private readonly List<string> runtimeLogs = new List<string>();

        private TextField promptField;
        private TextField jsonField;
        private Label noteLabel;
        private Label validationLabel;
        private TextField titleField;
        private TextField descriptionField;
        private FloatField canvasWidthField;
        private FloatField canvasHeightField;
        private TextField canvasBackgroundField;
        private ScrollView nodesList;
        private TextField compiledField;
        private ScrollView runtimeLogList;
        private IMGUIContainer editCanvas;
        private IMGUIContainer runtimeCanvas;

        private int selectedIndex = -1;
        private int dragIndex = -1;
        private Vector2 dragOffset;
        private bool refreshing;

        [MenuItem("Window/UGC Editor")]
        public static void Open()
        {
            GetWindow<UgcEditorWindow>("UGC Editor");
        }

        private void OnEnable()
        {
            EnsureDocument();
            SyncJsonFromDocument();
            RefreshDerivedState();
        }

        public void CreateGUI()
        {
            EnsureDocument();
            rootVisualElement.Clear();

            VisualTreeAsset tree = AssetDatabase.LoadAssetAtPath<VisualTreeAsset>(UxmlPath);
            if (tree != null)
            {
                tree.CloneTree(rootVisualElement);
            }
            else
            {
                rootVisualElement.Add(new Label("找不到 UXML: " + UxmlPath));
                return;
            }

            StyleSheet styleSheet = AssetDatabase.LoadAssetAtPath<StyleSheet>(UssPath);
            if (styleSheet != null)
            {
                rootVisualElement.styleSheets.Add(styleSheet);
            }

            QueryElements();
            BindEvents();
            AddCanvasContainers();
            RefreshAll();
        }

        private void QueryElements()
        {
            promptField = rootVisualElement.Q<TextField>("prompt-field");
            jsonField = rootVisualElement.Q<TextField>("json-field");
            noteLabel = rootVisualElement.Q<Label>("note-label");
            validationLabel = rootVisualElement.Q<Label>("validation-label");
            titleField = rootVisualElement.Q<TextField>("title-field");
            descriptionField = rootVisualElement.Q<TextField>("description-field");
            canvasWidthField = rootVisualElement.Q<FloatField>("canvas-width-field");
            canvasHeightField = rootVisualElement.Q<FloatField>("canvas-height-field");
            canvasBackgroundField = rootVisualElement.Q<TextField>("canvas-background-field");
            nodesList = rootVisualElement.Q<ScrollView>("nodes-list");
            compiledField = rootVisualElement.Q<TextField>("compiled-field");
            runtimeLogList = rootVisualElement.Q<ScrollView>("runtime-log-list");
        }

        private void BindEvents()
        {
            promptField.RegisterValueChangedCallback(evt => prompt = evt.newValue);
            jsonField.RegisterValueChangedCallback(evt => jsonText = evt.newValue);

            rootVisualElement.Q<Button>("generate-button").clicked += GenerateTemplate;
            rootVisualElement.Q<Button>("clear-button").clicked += ClearDocument;
            rootVisualElement.Q<Button>("parse-json-button").clicked += ParseJsonToDocument;
            rootVisualElement.Q<Button>("format-json-button").clicked += () =>
            {
                SyncJsonFromDocument();
                RefreshAll();
            };
            rootVisualElement.Q<Button>("save-json-button").clicked += SaveJsonFile;
            rootVisualElement.Q<Button>("add-text-button").clicked += () => AddNode("text");
            rootVisualElement.Q<Button>("add-rect-button").clicked += () => AddNode("rect");
            rootVisualElement.Q<Button>("add-button-button").clicked += () => AddNode("button");

            titleField.RegisterValueChangedCallback(evt =>
            {
                if (refreshing) return;
                document.meta.title = evt.newValue;
                OnDocumentEdited();
            });
            descriptionField.RegisterValueChangedCallback(evt =>
            {
                if (refreshing) return;
                document.meta.description = evt.newValue;
                OnDocumentEdited();
            });
            canvasWidthField.RegisterValueChangedCallback(evt =>
            {
                if (refreshing) return;
                document.canvas.width = Mathf.Max(1f, evt.newValue);
                OnDocumentEdited();
            });
            canvasHeightField.RegisterValueChangedCallback(evt =>
            {
                if (refreshing) return;
                document.canvas.height = Mathf.Max(1f, evt.newValue);
                OnDocumentEdited();
            });
            canvasBackgroundField.RegisterValueChangedCallback(evt =>
            {
                if (refreshing) return;
                document.canvas.background = evt.newValue;
                OnDocumentEdited();
            });
        }

        private void AddCanvasContainers()
        {
            VisualElement editHost = rootVisualElement.Q<VisualElement>("edit-canvas-host");
            VisualElement runtimeHost = rootVisualElement.Q<VisualElement>("runtime-canvas-host");

            editCanvas = new IMGUIContainer(DrawEditCanvas) { name = "edit-canvas" };
            runtimeCanvas = new IMGUIContainer(DrawRuntimeCanvas) { name = "runtime-canvas" };
            editHost.Add(editCanvas);
            runtimeHost.Add(runtimeCanvas);
        }

        private void RefreshAll()
        {
            if (promptField == null) return;

            refreshing = true;
            UgcDsl.Normalize(document);
            RefreshDerivedState();

            promptField.SetValueWithoutNotify(prompt);
            jsonField.SetValueWithoutNotify(jsonText);
            noteLabel.text = note;
            titleField.SetValueWithoutNotify(document.meta.title);
            descriptionField.SetValueWithoutNotify(document.meta.description);
            canvasWidthField.SetValueWithoutNotify(document.canvas.width);
            canvasHeightField.SetValueWithoutNotify(document.canvas.height);
            canvasBackgroundField.SetValueWithoutNotify(document.canvas.background);
            compiledField.SetValueWithoutNotify(string.IsNullOrEmpty(validationText)
                ? JsonUtility.ToJson(UgcDsl.Compile(document), true)
                : "请先修复 DSL 校验错误。");

            RefreshValidationLabel();
            RefreshNodesList();
            RefreshRuntimeLog();
            editCanvas?.MarkDirtyRepaint();
            runtimeCanvas?.MarkDirtyRepaint();
            refreshing = false;
        }

        private void RefreshValidationLabel()
        {
            validationLabel.RemoveFromClassList("validation-ok");
            validationLabel.RemoveFromClassList("validation-error");
            if (string.IsNullOrEmpty(validationText))
            {
                validationLabel.text = "校验：通过";
                validationLabel.AddToClassList("validation-ok");
            }
            else
            {
                validationLabel.text = "校验：\n" + validationText;
                validationLabel.AddToClassList("validation-error");
            }
        }

        private void RefreshNodesList()
        {
            nodesList.Clear();
            for (int i = 0; i < document.nodes.Count; i++)
            {
                nodesList.Add(CreateNodeElement(i));
            }
        }

        private VisualElement CreateNodeElement(int index)
        {
            UgcNode node = document.nodes[index];
            VisualElement card = new VisualElement();
            card.AddToClassList("node-card");
            if (selectedIndex == index)
            {
                card.AddToClassList("node-card-selected");
            }

            VisualElement header = new VisualElement();
            header.AddToClassList("node-header");
            Button selectButton = new Button(() =>
            {
                selectedIndex = index;
                RefreshAll();
            })
            {
                text = node.type + " · " + node.id
            };
            selectButton.AddToClassList("node-title");
            Button deleteButton = new Button(() => RemoveNode(index)) { text = "删除" };
            header.Add(selectButton);
            header.Add(deleteButton);
            card.Add(header);

            PopupField<string> typeField = new PopupField<string>(
                "type",
                new List<string> { "text", "rect", "button" },
                TypeToIndex(node.type)
            );
            typeField.RegisterValueChangedCallback(evt =>
            {
                node.type = evt.newValue;
                OnDocumentEdited();
            });
            card.Add(typeField);

            AddTextField(card, "id", node.id, v => node.id = v);
            AddFloatField(card, "x", node.x, v => node.x = v);
            AddFloatField(card, "y", node.y, v => node.y = v);
            AddFloatField(card, "z", node.z, v => node.z = v);

            if (node.type == "text")
            {
                AddTextField(card, "content", node.content, v => node.content = v);
                AddFloatField(card, "fontSize", node.fontSize, v => node.fontSize = v);
                AddTextField(card, "color", node.color, v => node.color = v);
            }
            else if (node.type == "rect")
            {
                AddFloatField(card, "width", node.width, v => node.width = v);
                AddFloatField(card, "height", node.height, v => node.height = v);
                AddTextField(card, "fill", node.fill, v => node.fill = v);
                AddFloatField(card, "radius", node.radius, v => node.radius = v);
            }
            else
            {
                AddFloatField(card, "width", node.width, v => node.width = v);
                AddFloatField(card, "height", node.height, v => node.height = v);
                AddTextField(card, "label", node.label, v => node.label = v);
                AddTextField(card, "actionId", node.actionId, v => node.actionId = v);
            }

            return card;
        }

        private void AddTextField(VisualElement parent, string label, string value, System.Action<string> setter)
        {
            TextField field = new TextField(label);
            field.SetValueWithoutNotify(value);
            field.RegisterValueChangedCallback(evt =>
            {
                setter(evt.newValue);
                OnDocumentEdited();
            });
            parent.Add(field);
        }

        private void AddFloatField(VisualElement parent, string label, float value, System.Action<float> setter)
        {
            FloatField field = new FloatField(label);
            field.SetValueWithoutNotify(value);
            field.RegisterValueChangedCallback(evt =>
            {
                setter(evt.newValue);
                OnDocumentEdited();
            });
            parent.Add(field);
        }

        private void GenerateTemplate()
        {
            document = UgcDsl.MockFromPrompt(prompt);
            selectedIndex = -1;
            note = "已写入下方 DSL（JSON）。C# 版当前使用本地模板，不直连 Cursor 内置 LLM。";
            SyncJsonFromDocument();
            RefreshAll();
        }

        private void ClearDocument()
        {
            document = UgcDsl.EmptyDocument();
            selectedIndex = -1;
            runtimeLogs.Clear();
            note = "已创建空白文档。";
            SyncJsonFromDocument();
            RefreshAll();
        }

        private void ParseJsonToDocument()
        {
            UgcDocument parsed;
            string error;
            if (UgcDsl.TryParseJson(jsonText, out parsed, out error))
            {
                document = parsed;
                selectedIndex = -1;
                note = "JSON 已解析到文档。";
                SyncJsonFromDocument();
            }
            else
            {
                validationText = error;
                note = "JSON 解析或校验失败。";
            }

            RefreshAll();
        }

        private void DrawEditCanvas()
        {
            if (document == null) return;

            float scale = GetCanvasScale();
            Rect stage = GetCanvasRect(scale);
            Event evt = Event.current;

            HandleEditCanvasInput(stage, scale, evt);
            DrawCanvasBackground(stage);

            List<int> order = SortedNodeIndices();
            for (int i = 0; i < order.Count; i++)
            {
                int nodeIndex = order[i];
                DrawEditableNode(document.nodes[nodeIndex], nodeIndex, stage, scale);
            }
        }

        private void DrawRuntimeCanvas()
        {
            if (document == null) return;
            if (!string.IsNullOrEmpty(validationText))
            {
                EditorGUILayout.HelpBox("请先修复 DSL 校验错误。", MessageType.Warning);
                return;
            }

            UgcCompiledProgram program = UgcDsl.Compile(document);
            float scale = GetCanvasScale();
            Rect stage = GetCanvasRect(scale);
            DrawCanvasBackground(stage);

            for (int i = 0; i < program.ops.Count; i++)
            {
                UgcRenderOp op = program.ops[i];
                Rect rect = ToStageRect(stage, scale, op.x, op.y, op.width, op.height);
                if (op.kind == UgcRenderKind.Rect)
                {
                    EditorGUI.DrawRect(rect, UgcDsl.ParseColor(op.fill, new Color(0.24f, 0.27f, 0.32f)));
                }
                else if (op.kind == UgcRenderKind.Text)
                {
                    DrawLabel(rect, op.content, op.color, op.fontSize * scale);
                }
                else if (GUI.Button(rect, op.label))
                {
                    AddRuntimeLog("action: " + op.actionId + " (\"" + op.label + "\")");
                }
            }
        }

        private void HandleEditCanvasInput(Rect stage, float scale, Event evt)
        {
            if (evt.type == EventType.MouseDown && evt.button == 0 && stage.Contains(evt.mousePosition))
            {
                Vector2 docPoint = ToDocumentPoint(stage, scale, evt.mousePosition);
                int hit = HitTest(docPoint);
                selectedIndex = hit;
                dragIndex = hit;
                if (hit >= 0)
                {
                    UgcNode node = document.nodes[hit];
                    dragOffset = new Vector2(docPoint.x - node.x, docPoint.y - node.y);
                }

                evt.Use();
                RefreshAll();
            }
            else if (evt.type == EventType.MouseDrag && dragIndex >= 0)
            {
                Vector2 docPoint = ToDocumentPoint(stage, scale, evt.mousePosition);
                UgcNode node = document.nodes[dragIndex];
                Vector2 next = ClampNodePosition(node, docPoint.x - dragOffset.x, docPoint.y - dragOffset.y);
                if (!Mathf.Approximately(node.x, next.x) || !Mathf.Approximately(node.y, next.y))
                {
                    node.x = next.x;
                    node.y = next.y;
                    OnDocumentEdited();
                }

                evt.Use();
            }
            else if (evt.type == EventType.MouseUp && dragIndex >= 0)
            {
                dragIndex = -1;
                evt.Use();
            }
        }

        private void DrawEditableNode(UgcNode node, int nodeIndex, Rect stage, float scale)
        {
            Rect bounds = GetNodeBounds(node);
            Rect rect = ToStageRect(stage, scale, bounds.x, bounds.y, bounds.width, bounds.height);

            if (node.type == "rect")
            {
                EditorGUI.DrawRect(rect, UgcDsl.ParseColor(node.fill, new Color(0.24f, 0.27f, 0.32f)));
            }
            else if (node.type == "button")
            {
                GUI.Box(rect, node.label);
            }
            else
            {
                DrawLabel(rect, node.content, node.color, node.fontSize * scale);
            }

            if (selectedIndex == nodeIndex)
            {
                DrawOutline(rect, new Color(0.54f, 0.71f, 0.97f));
            }
        }

        private void DrawCanvasBackground(Rect stage)
        {
            EditorGUI.DrawRect(stage, UgcDsl.ParseColor(document.canvas.background, new Color(0.1f, 0.11f, 0.14f)));
            DrawOutline(stage, new Color(1f, 1f, 1f, 0.12f));
        }

        private static void DrawOutline(Rect rect, Color color)
        {
            Handles.BeginGUI();
            Handles.color = color;
            Handles.DrawAAPolyLine(
                2f,
                new Vector3(rect.xMin, rect.yMin),
                new Vector3(rect.xMax, rect.yMin),
                new Vector3(rect.xMax, rect.yMax),
                new Vector3(rect.xMin, rect.yMax),
                new Vector3(rect.xMin, rect.yMin)
            );
            Handles.EndGUI();
        }

        private Rect GetCanvasRect(float scale)
        {
            float width = document.canvas.width * scale;
            float height = document.canvas.height * scale;
            Rect area = GUILayoutUtility.GetRect(width, height, GUILayout.ExpandWidth(true));
            float x = area.x + Mathf.Max(0f, (area.width - width) * 0.5f);
            return new Rect(x, area.y, width, height);
        }

        private float GetCanvasScale()
        {
            float available = Mathf.Max(100f, position.width - 100f);
            return Mathf.Min(1f, available / Mathf.Max(1f, document.canvas.width));
        }

        private List<int> SortedNodeIndices()
        {
            List<int> indices = new List<int>();
            for (int i = 0; i < document.nodes.Count; i++)
            {
                indices.Add(i);
            }

            indices.Sort((a, b) => document.nodes[a].z.CompareTo(document.nodes[b].z));
            return indices;
        }

        private int HitTest(Vector2 docPoint)
        {
            List<int> order = SortedNodeIndices();
            for (int i = order.Count - 1; i >= 0; i--)
            {
                int index = order[i];
                if (GetNodeBounds(document.nodes[index]).Contains(docPoint))
                {
                    return index;
                }
            }

            return -1;
        }

        private Rect GetNodeBounds(UgcNode node)
        {
            if (node.type == "rect" || node.type == "button")
            {
                return new Rect(node.x, node.y, Mathf.Max(1f, node.width), Mathf.Max(1f, node.height));
            }

            float fontSize = node.fontSize > 0f ? node.fontSize : 16f;
            string text = node.content ?? "";
            string[] lines = text.Split('\n');
            int maxChars = 1;
            for (int i = 0; i < lines.Length; i++)
            {
                maxChars = Mathf.Max(maxChars, lines[i].Length);
            }

            float availableWidth = Mathf.Max(1f, document.canvas.width - node.x);
            float width = Mathf.Min(availableWidth, Mathf.Max(48f, maxChars * fontSize * 0.55f));
            float height = Mathf.Max(1, lines.Length) * fontSize * 1.25f;
            return new Rect(node.x, node.y, width, height);
        }

        private Vector2 ClampNodePosition(UgcNode node, float x, float y)
        {
            Rect bounds = GetNodeBounds(node);
            float maxX = Mathf.Max(0f, document.canvas.width - bounds.width);
            float maxY = Mathf.Max(0f, document.canvas.height - bounds.height);
            return new Vector2(Mathf.Clamp(x, 0f, maxX), Mathf.Clamp(y, 0f, maxY));
        }

        private static Rect ToStageRect(Rect stage, float scale, float x, float y, float width, float height)
        {
            return new Rect(stage.x + x * scale, stage.y + y * scale, width * scale, height * scale);
        }

        private static Vector2 ToDocumentPoint(Rect stage, float scale, Vector2 mouse)
        {
            return new Vector2((mouse.x - stage.x) / scale, (mouse.y - stage.y) / scale);
        }

        private void DrawLabel(Rect rect, string text, string color, float fontSize)
        {
            GUIStyle style = new GUIStyle(EditorStyles.label)
            {
                normal = { textColor = UgcDsl.ParseColor(color, Color.white) },
                fontSize = Mathf.Clamp(Mathf.RoundToInt(fontSize), 8, 40),
                wordWrap = true
            };
            GUI.Label(rect, text, style);
        }

        private void AddNode(string type)
        {
            UgcNode node = new UgcNode
            {
                type = type,
                id = type + "_" + (document.nodes.Count + 1),
                x = 80f,
                y = 80f,
                z = document.nodes.Count
            };
            if (type == "text")
            {
                node.content = "文本";
            }
            else if (type == "rect")
            {
                node.width = 120f;
                node.height = 80f;
                node.fill = "#3d4451";
            }
            else
            {
                node.width = 120f;
                node.height = 40f;
                node.label = "按钮";
                node.actionId = "click_" + node.id;
            }

            document.nodes.Add(node);
            selectedIndex = document.nodes.Count - 1;
            OnDocumentEdited();
        }

        private void RemoveNode(int index)
        {
            document.nodes.RemoveAt(index);
            if (selectedIndex == index)
            {
                selectedIndex = -1;
            }
            else if (selectedIndex > index)
            {
                selectedIndex--;
            }

            OnDocumentEdited();
        }

        private void AddRuntimeLog(string message)
        {
            runtimeLogs.Add(System.DateTime.Now.ToLongTimeString() + " " + message);
            while (runtimeLogs.Count > 50)
            {
                runtimeLogs.RemoveAt(0);
            }

            RefreshRuntimeLog();
        }

        private void RefreshRuntimeLog()
        {
            runtimeLogList.Clear();
            if (runtimeLogs.Count == 0)
            {
                runtimeLogList.Add(new Label("点击按钮触发 actionId"));
                return;
            }

            for (int i = 0; i < runtimeLogs.Count; i++)
            {
                runtimeLogList.Add(new Label(runtimeLogs[i]));
            }
        }

        private void OnDocumentEdited()
        {
            UgcDsl.Normalize(document);
            SyncJsonFromDocument();
            RefreshAll();
        }

        private void SyncJsonFromDocument()
        {
            jsonText = UgcDsl.ToJson(document, true);
        }

        private void RefreshDerivedState()
        {
            List<UgcValidationIssue> issues = UgcDsl.Validate(document);
            validationText = issues.Count == 0 ? "" : UgcDsl.FormatIssues(issues);
        }

        private void SaveJsonFile()
        {
            string path = EditorUtility.SaveFilePanel("下载 JSON 文件", Application.dataPath, "ugc-scene.json", "json");
            if (string.IsNullOrEmpty(path))
            {
                return;
            }

            System.IO.File.WriteAllText(path, UgcDsl.ToJson(document, true));
            AssetDatabase.Refresh();
        }

        private void EnsureDocument()
        {
            if (document == null)
            {
                document = UgcDsl.MockFromPrompt(prompt);
            }
        }

        private static int TypeToIndex(string type)
        {
            if (type == "rect") return 1;
            if (type == "button") return 2;
            return 0;
        }
    }
}
