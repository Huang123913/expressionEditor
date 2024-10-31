class ExpressionEditor {
  constructor(containerId, storedContent, options = {}) {
    this.containerId = containerId;
    this.storedContent = storedContent;

    // 初始化默认 options 和 customToolbarButtons
    this.options = {
      customToolbarButtons: [],
      ...options,
    };

    // 初始化 dynamicEditorData 和 dynamicUserData
    this.dynamicEditorData = {
      keywords: options.dynamicEditorData?.keywords || [
        "IF",
        "AND",
        "OR",
        "NOT",
      ],
      functions: options.dynamicEditorData?.functions,
    };

    this.dynamicUserData = {
      variables: options.dynamicUserData?.variables,
      systemVariables: options.dynamicUserData?.systemVariables,
      sheets: options.dynamicUserData?.sheets,
      customVariableTypes: options.dynamicUserData?.customVariableTypes,
    };

    this.isReadOnly = false; // 跟踪编辑器是否为只读模式

    // 注册自定义语言
    this._registerCustomLanguage();

    // 将存储的值转换为显示的值
    const displayValue = this.convertStorageToDisplay(this.storedContent);

    // 初始化 Monaco Editor
    this.editor = monaco.editor.create(
      document.getElementById(this.containerId),
      {
        value: displayValue || "",
        language: "customExpressionLanguage",
        theme: this.options.theme || "myCustomTheme",
        readOnly: this.isReadOnly,
        //hover: { enabled: true },  // Enable hover for documentation
        suggest: { snippetsPreventQuickSuggestions: false, showIcons: true },
        ...this.options.editorOptions,
      }
    );

    // 注册补全提供器
    monaco.languages.registerCompletionItemProvider(
      "customExpressionLanguage",
      this._createCompletionProvider()
    );

    // 初始化工具栏
    // this._initializeToolbar();

    // 添加内容变化监听器
    this._addContentChangeListener();
  }

  // 注册自定义语言
  _registerCustomLanguage() {
    const regexes = this._generateDynamicRegexes();

    monaco.languages.register({ id: "customExpressionLanguage" });

    // 设置语法高亮规则
    monaco.languages.setMonarchTokensProvider("customExpressionLanguage", {
      tokenizer: {
        root: [
          // 自定义变量类型
          [regexes.customVariableTypes, "custom-variable"],
          // 表引用
          [regexes.sheets, "sheet-reference"],
          // 变量
          [regexes.variables, "variable"],
          // 关键字
          [regexes.keywords, "keyword"],
          // 函数
          [regexes.functions, "function"],
          // 系统变量
          [regexes.systemVariables, "system-variable"],
        ],
      },
    });

    // 设置高亮配色规则
    monaco.editor.defineTheme("myCustomTheme", {
      base: "vs",
      inherit: true,
      rules: [
        { token: "keyword", foreground: "FF0000", fontStyle: "bold" },
        { token: "function", foreground: "008800" },
        { token: "variable", foreground: "0000FF" },
        { token: "system-variable", foreground: "800000" },
        { token: "sheet-reference", foreground: "FF00FF" },
        { token: "custom-variable", foreground: "800080" },
      ],
      colors: {
        "editor.foreground": "#000000",
        "editor.background": "#FFFFFF",
        "editorCursor.foreground": "#000000",
        "editor.lineHighlightBackground": "#F0F0F0",
        "editorLineNumber.foreground": "#AAAAAA",
        "editor.selectionBackground": "#D0D0D0",
        "editor.inactiveSelectionBackground": "#E0E0E0",
      },
    });
    monaco.editor.setTheme("myCustomTheme");
  }

  // 动态生成正则表达式
  _generateDynamicRegexes() {
    const escapeRegExp = (string) => {
      return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& 表示整个匹配的字符串
    };

    // 处理 keywords
    const keywords = this.dynamicEditorData.keywords
      .map((keyword) => escapeRegExp(keyword.label))
      .join("|");

    // 处理 functions
    const functions = Object.keys(this.dynamicEditorData.functions)
      .map(escapeRegExp)
      .join("|");

    // 处理 systemVariables
    const systemVariables = this.dynamicUserData.systemVariables
      .map((sv) => escapeRegExp(sv.display))
      .join("|");

    // 处理 variables
    const variables = this.dynamicUserData.variables
      .map((v) => escapeRegExp(v.display))
      .join("|");

    // 处理 sheets 和每个 sheet 的 columns
    const sheets = this.dynamicUserData.sheets
      .map((sheet) => {
        const columns = sheet.columns
          .map((col) => escapeRegExp(col.display))
          .join("|");
        return `(${escapeRegExp(sheet.display)})\\.(${columns})`; // 支持 sheetName.columnName 结构
      })
      .join("|");

    // 处理 customVariableTypes 和它们的嵌套结构
    const customVariableTypes = Object.keys(
      this.dynamicUserData.customVariableTypes
    )
      .map((type) => {
        const allowedVariables = Array.isArray(
          this.dynamicUserData.customVariableTypes[type].allowedVariables
        )
          ? this.dynamicUserData.customVariableTypes[type].allowedVariables
              .map((v) => escapeRegExp(v.display))
              .join("|")
          : ""; // 确保 allowedVariables 是数组

        const allowedSheets = Array.isArray(
          this.dynamicUserData.customVariableTypes[type].allowedSheets
        )
          ? this.dynamicUserData.customVariableTypes[type].allowedSheets
              .map((sheet) => {
                const columns = sheet.columns
                  .map((col) => escapeRegExp(col.display))
                  .join("|");
                return `(${escapeRegExp(sheet.display)})\\.(${columns})`;
              })
              .join("|")
          : ""; // 确保 allowedSheets 是数组

        const typeRegex = escapeRegExp(type);

        return allowedVariables && allowedSheets
          ? `(${typeRegex})\\.?(${allowedVariables}|${allowedSheets})?`
          : allowedVariables
          ? `(${typeRegex})\\.?(${allowedVariables})?`
          : `(${typeRegex})\\.?(${allowedSheets})?`;
      })
      .join("|");

    // 返回所有正则表达式对象
    return {
      keywords: new RegExp(`\\b(${keywords})\\b`),
      functions: new RegExp(`\\b(${functions})\\b`),
      systemVariables: new RegExp(`\\b(${systemVariables})\\b`),
      variables: new RegExp(`\\b(${variables})\\b`),
      sheets: new RegExp(sheets),
      customVariableTypes: new RegExp(customVariableTypes),
    };
  }

  // 存储值 -> 显示值的转换函数
  convertStorageToDisplay(value) {
    let convertedValue = value;

    // 转换 variables
    this.dynamicUserData.variables.forEach((variable) => {
      convertedValue = convertedValue.replace(
        new RegExp(variable.stored, "g"),
        variable.display
      );
    });

    // 转换 systemVariables
    this.dynamicUserData.systemVariables.forEach((sysVar) => {
      convertedValue = convertedValue.replace(
        new RegExp(sysVar.stored, "g"),
        sysVar.display
      );
    });

    // 转换 sheets
    this.dynamicUserData.sheets.forEach((sheet) => {
      sheet.columns.forEach((col) => {
        const regex = new RegExp(`${sheet.stored}\\.${col.stored}`, "g");
        convertedValue = convertedValue.replace(
          regex,
          `${sheet.display}.${col.display}`
        );
      });
    });

    // 转换 customVariableTypes
    Object.keys(this.dynamicUserData.customVariableTypes).forEach((type) => {
      const { allowedVariables = [], allowedSheets = [] } =
        this.dynamicUserData.customVariableTypes[type];

      // 转换 allowedVariables
      allowedVariables.forEach((variable) => {
        const regex = new RegExp(`${type}${variable.stored}`, "g");
        convertedValue = convertedValue.replace(
          regex,
          `${type}${variable.display}`
        );
      });

      // 转换 allowedSheets
      allowedSheets.forEach((sheet) => {
        sheet.columns.forEach((col) => {
          const regex = new RegExp(
            `${type}${sheet.stored}\\.${col.stored}`,
            "g"
          );
          convertedValue = convertedValue.replace(
            regex,
            `${type}${sheet.display}.${col.display}`
          );
        });
      });
    });

    return convertedValue;
  }

  // 显示值 -> 存储值的转换函数
  convertDisplayToStorage(value) {
    let convertedValue = value;

    // 转换 variables
    this.dynamicUserData.variables.forEach((variable) => {
      convertedValue = convertedValue.replace(
        new RegExp(variable.display, "g"),
        variable.stored
      );
    });

    // 转换 systemVariables
    this.dynamicUserData.systemVariables.forEach((sysVar) => {
      convertedValue = convertedValue.replace(
        new RegExp(sysVar.display, "g"),
        sysVar.stored
      );
    });

    // 转换 sheets
    this.dynamicUserData.sheets.forEach((sheet) => {
      sheet.columns.forEach((col) => {
        const regex = new RegExp(`${sheet.display}\\.${col.display}`, "g");
        convertedValue = convertedValue.replace(
          regex,
          `${sheet.stored}.${col.stored}`
        );
      });
    });

    // 转换 customVariableTypes
    Object.keys(this.dynamicUserData.customVariableTypes).forEach((type) => {
      const { allowedVariables = [], allowedSheets = [] } =
        this.dynamicUserData.customVariableTypes[type];

      // 转换 allowedVariables
      allowedVariables.forEach((variable) => {
        const regex = new RegExp(`${type}${variable.display}`, "g");
        convertedValue = convertedValue.replace(
          regex,
          `${type}${variable.stored}`
        );
      });

      // 转换 allowedSheets
      allowedSheets.forEach((sheet) => {
        sheet.columns.forEach((col) => {
          const regex = new RegExp(
            `${type}${sheet.display}\\.${col.display}`,
            "g"
          );
          convertedValue = convertedValue.replace(
            regex,
            `${type}${sheet.stored}.${col.stored}`
          );
        });
      });
    });

    return convertedValue;
  }

  // 初始化工具栏按钮及其操作
  _initializeToolbar() {
    const toggleEditBtn = document.getElementById("toggleEditBtn");
    const saveBtn = document.getElementById("saveBtn");
    const undoBtn = document.getElementById("undoBtn");
    const redoBtn = document.getElementById("redoBtn");

    toggleEditBtn.addEventListener("click", () => this._toggleEditMode());
    saveBtn.addEventListener("click", () => this._saveContent());
    undoBtn.addEventListener("click", () =>
      this.editor.trigger("keyboard", "undo", null)
    );
    redoBtn.addEventListener("click", () =>
      this.editor.trigger("keyboard", "redo", null)
    );

    // 自定义按钮
    this.options.customToolbarButtons.forEach((btnConfig) => {
      const btn = document.createElement("button");
      btn.innerText = btnConfig.label;
      btn.addEventListener("click", btnConfig.action);
      document.getElementById("toolbar").appendChild(btn);
    });
  }

  // 切换编辑模式和只读模式
  _toggleEditMode() {
    this.isReadOnly = !this.isReadOnly;
    this.editor.updateOptions({ readOnly: this.isReadOnly });
    alert(
      this.isReadOnly ? "Editor is now read-only." : "Editor is now editable."
    );
  }

  // 保存编辑器内容，将显示值转换为存储值
  _saveContent() {
    const displayContent = this.editor.getValue();
    const storageContent = this.convertDisplayToStorage(displayContent);
    // 如果有外部的 onSave 钩子，则调用它
    if (typeof this.options.onSave === "function") {
      this.options.onSave(storageContent); // 将转换后的存储值传递给外部
    } else {
      console.log("Stored content:", storageContent);
    }
  }

  // 自动补全配置
  _createCompletionProvider() {
    const { keywords, functions } = this.dynamicEditorData;
    const { variables, systemVariables, sheets, customVariableTypes } =
      this.dynamicUserData;

    return {
      provideCompletionItems: (model, position) => {
        const suggestions = [];

        // 获取当前行内容和用户输入的前缀（基于光标位置）
        const word = model.getWordUntilPosition(position);
        const userInput = word.word.toLowerCase();
        const currentLine = model.getLineContent(position.lineNumber);
        const dotIndex = currentLine.lastIndexOf(".", position.column - 1);
        const charBeforeCursor = currentLine[position.column - 2]; // 获取光标前的一个字符（注意光标是从1开始的）

        if (charBeforeCursor !== ".") {
          // 没有输入 `.` 的情况，只补全表名、函数和变量
          keywords.forEach((keyword) => {
            if (keyword.label.toLowerCase().startsWith(userInput)) {
              suggestions.push({
                label: keyword.label,
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: keyword.label,
                detail: keyword.documentation, // 提取 documentation
              });
            }
          });

          Object.keys(functions).forEach((func) => {
            const funcData = functions[func];
            if (func.toLowerCase().startsWith(userInput)) {
              suggestions.push({
                label: func,
                kind: monaco.languages.CompletionItemKind.Function,
                insertText: `${func}()`,
                detail: funcData.documentation, // 提取 documentation
              });
            }
          });

          variables.forEach((variable) => {
            if (variable.display.toLowerCase().startsWith(userInput)) {
              suggestions.push({
                label: variable.display,
                kind: monaco.languages.CompletionItemKind.Variable,
                insertText: variable.display,
                detail: variable.documentation, // 提取 documentation
              });
            }
          });

          systemVariables.forEach((sysVar) => {
            if (sysVar.display.toLowerCase().startsWith(userInput)) {
              suggestions.push({
                label: sysVar.display,
                kind: monaco.languages.CompletionItemKind.Variable,
                insertText: sysVar.display,
                detail: sysVar.documentation, // 提取 documentation
              });
            }
          });

          sheets.forEach((sheet) => {
            if (sheet.display.toLowerCase().startsWith(userInput)) {
              suggestions.push({
                label: sheet.display,
                kind: monaco.languages.CompletionItemKind.Reference,
                insertText: sheet.display,
                detail: sheet.documentation, // 提取 documentation
              });
            }
          });

          Object.keys(customVariableTypes).forEach((type) => {
            if (type.toLowerCase().startsWith(userInput)) {
              suggestions.push({
                label: type,
                kind: monaco.languages.CompletionItemKind.Reference,
                insertText: type,
                detail: customVariableTypes[type].documentation, // 提取 documentation
              });
            }
          });
        } else {
          // 输入了 `.` 后，补全列名和自定义类型的子级
          // 只获取 `.` 之前的合法表名或变量类型
          const baseInput = this._extractBaseInput(currentLine, dotIndex);

          // 提取合法的列名输入，遇到特殊字符则停止截取
          const columnInput = this._extractValidColumnInput(
            currentLine.substring(dotIndex + 1).trim()
          );

          // 表名列名提示
          const sheet = sheets.find(
            (sheet) => sheet.display.toLowerCase() === baseInput.toLowerCase()
          );
          if (sheet) {
            if (columnInput === "") {
              // 如果 columnInput 为空，则显示所有列名
              sheet.columns.forEach((col) => {
                suggestions.push({
                  label: col.display,
                  kind: monaco.languages.CompletionItemKind.Reference,
                  insertText: col.display,
                  detail: col.documentation, // 提取 documentation
                });
              });
            } else {
              // 根据输入提示列名
              sheet.columns.forEach((col) => {
                if (col.display.toLowerCase().startsWith(columnInput)) {
                  suggestions.push({
                    label: col.display,
                    kind: monaco.languages.CompletionItemKind.Reference,
                    insertText: col.display,
                    detail: col.documentation, // 提取 documentation
                  });
                }
              });
            }
          }

          // customVariableTypes 子级提示
          Object.keys(customVariableTypes).forEach((type) => {
            const sanitizedType = type.replace(/\.$/, ""); // 去掉尾部点号，避免匹配错误

            // 获取最后一个点之前的上下文，比如 BR_IN_PARENT.Input Sheet 1
            const fullContext = this._extractFullContext(currentLine, dotIndex);

            if (fullContext.startsWith(sanitizedType)) {
              const typeData = customVariableTypes[type];

              // 提取出类型名之后的部分（比如 ".Input Sheet 1"），需要去掉类型名后面部分的 `.` 字符
              let remainingInput = fullContext
                .substring(sanitizedType.length)
                .trim();

              if (remainingInput.startsWith(".")) {
                remainingInput = remainingInput.substring(1).trim();
              }

              if (remainingInput[remainingInput.length - 1] === ".") {
                remainingInput = remainingInput
                  .substring(0, remainingInput.length - 1)
                  .trim();
              }

              const allowedVariables = Array.isArray(typeData.allowedVariables)
                ? typeData.allowedVariables
                : [];
              const allowedSheets = Array.isArray(typeData.allowedSheets)
                ? typeData.allowedSheets
                : [];

              if (!remainingInput) {
                // 提示 allowedVariables 和 allowedSheets
                allowedVariables.forEach((variable) => {
                  suggestions.push({
                    label: variable.display,
                    kind: monaco.languages.CompletionItemKind.Variable,
                    insertText: variable.display,
                    detail: variable.documentation, // 提取 documentation
                  });
                });

                allowedSheets.forEach((sheet) => {
                  suggestions.push({
                    label: sheet.display,
                    kind: monaco.languages.CompletionItemKind.Reference,
                    insertText: sheet.display,
                    detail: sheet.documentation, // 提取 documentation
                  });
                });
              }

              const matchingSheet = allowedSheets.find(
                (sheet) =>
                  sheet.display.toLowerCase() === remainingInput.toLowerCase()
              );
              if (matchingSheet) {
                if (columnInput === "") {
                  matchingSheet.columns.forEach((col) => {
                    suggestions.push({
                      label: col.display,
                      kind: monaco.languages.CompletionItemKind.Reference,
                      insertText: col.display,
                      detail: col.documentation, // 提取 documentation
                    });
                  });
                } else {
                  matchingSheet.columns.forEach((col) => {
                    if (
                      col.display
                        .toLowerCase()
                        .startsWith(columnInput.toLowerCase())
                    ) {
                      suggestions.push({
                        label: col.display,
                        kind: monaco.languages.CompletionItemKind.Reference,
                        insertText: col.display,
                        detail: col.documentation, // 提取 documentation
                      });
                    }
                  });
                }
              }
            }
          });
        }
        return { suggestions };
      },
      triggerCharacters: ["(", "+", "-", "."],
    };
  }

  // 手动触发补全提示
  _triggerAutoComplete() {
    const model = this.editor.getModel();
    const position = this.editor.getPosition();

    // 手动触发补全
    this.editor.trigger("keyboard", "editor.action.triggerSuggest", {
      model,
      position,
    });
  }

  // 提取 `.` 之前的合法表名或变量类型
  _extractBaseInput(currentLine, dotIndex) {
    const beforeDot = currentLine.substring(0, dotIndex).trim();

    // 使用正则匹配出最后的合法表名或变量类型
    // 可以处理简单变量、系统变量、自定义类型或表名
    const match = beforeDot.match(/[\w\s]+$/);

    return match ? match[0].trim() : ""; // 返回匹配到的部分
  }

  // 提取合法的 `columnInput`，遇到特殊字符则停止截取
  _extractValidColumnInput(columnInput) {
    // 使用正则表达式，只保留合法字符，遇到第一个特殊字符就停止
    const match = columnInput.match(/^[\w]+/);
    return match ? match[0] : ""; // 返回匹配到的部分，或者空字符串
  }

  _extractFullContext(currentLine, dotIndex) {
    // 从 dotIndex 向前找到最近的自定义类型名和表名，遇到特殊字符则停止
    let context = "";
    let i = dotIndex - 1;
    // 向前遍历，遇到特殊字符或空格就停止
    while (i >= 0) {
      const char = currentLine[i];

      // 如果遇到特殊字符（如 +, -, =, (, ) 等），停止提取
      if (/[+\-*/()=,]/.test(char)) {
        break;
      }

      // 拼接字符，形成完整的上下文
      context = char + context;
      i--;
    }

    // 返回提取的上下文内容
    return context.trim();
  }

  // 动态刷新 editorData
  refreshEditorData(newEditorData = {}) {
    this.dynamicEditorData = {
      ...this.dynamicEditorData,
      ...newEditorData,
    };

    monaco.languages.registerCompletionItemProvider(
      "customExpressionLanguage",
      this._createCompletionProvider()
    );
  }

  // 动态刷新 userData
  refreshUserData(newUserData = {}) {
    this.dynamicUserData = {
      ...this.dynamicUserData,
      ...newUserData,
    };

    monaco.languages.registerCompletionItemProvider(
      "customExpressionLanguage",
      this._createCompletionProvider()
    );
  }

  // 动态刷新存储内容
  refreshStoredContent(newStoredContent) {
    this.storedContent = newStoredContent;
    const displayValue = this.convertStorageToDisplay(newStoredContent);
    this.editor.setValue(displayValue);
  }

  // 添加监听器，在输入 `.` 后手动触发补全
  _addContentChangeListener() {
    this.editor.onDidChangeModelContent((event) => {
      const changes = event.changes;
      const lastChange = changes[changes.length - 1];

      // 检测输入 `.` 后手动触发补全
      if (lastChange.text === ".") {
        this._triggerAutoComplete();
      }
      // 触发外部 onChange 钩子
      if (typeof this.options.onChange === "function") {
        const displayContent = this.editor.getValue();
        const storageContent = this.convertDisplayToStorage(displayContent);
        this.options.onChange(storageContent); // 传递当前的编辑器内容
      }
      this.validateExpression();
    });
  }

  // 简单语法错误检测逻辑，确保括号匹配和函数参数类型检测
  _performSyntaxCheck(content) {
    const errors = [];
    const openParens = (content.match(/\(/g) || []).length;
    const closeParens = (content.match(/\)/g) || []).length;

    // 检查括号匹配
    if (openParens !== closeParens) {
      errors.push({
        line: 1,
        column: content.indexOf("("),
        message: "Mismatched parentheses detected.",
      });
    }

    // 使用增强的正则表达式来匹配函数
    const functionRegex = /([A-Z_]+)\s*\((.*)\)/g; // 匹配所有函数
    let match;

    while ((match = functionRegex.exec(content)) !== null) {
      const func = match[1]; // 函数名
      const argsContent = match[2]; // 参数内容

      // 使用递归解析嵌套的函数和表达式
      const args = this._parseArguments(argsContent);

      const functionDefinition = this.dynamicEditorData.functions[func];
      if (!functionDefinition) {
        errors.push({
          line: content.substr(0, match.index).split("\n").length,
          column: match.index,
          message: `Unknown function: ${func}.`,
        });
        continue;
      }

      const { minArgs, maxArgs, argTypes, defaultArgTypes } =
        functionDefinition;

      // 检查参数数量
      if (
        args.length < minArgs ||
        (maxArgs !== "infinity" && args.length > maxArgs)
      ) {
        errors.push({
          line: content.substr(0, match.index).split("\n").length,
          column: match.index,
          message: `Function ${func} expects ${minArgs}-${maxArgs} arguments but got ${args.length}.`,
        });
        continue; // 参数数量错误时跳过类型检查
      }

      // 检查每个参数的类型
      args.forEach((arg, index) => {
        const applicableTypes =
          argTypes[index] === "...default" || !argTypes[index]
            ? defaultArgTypes
            : [...defaultArgTypes, ...argTypes[index]];

        const isValidType = this._isValidArgumentType(arg, applicableTypes);

        if (!isValidType) {
          errors.push({
            line: content.substr(0, match.index).split("\n").length,
            column: match.index,
            message: `Invalid argument type for function ${func}. Expected ${applicableTypes.join(
              ", "
            )} but got ${arg}.`,
          });
        }
      });
    }

    return errors;
  }

  // 解析参数，考虑嵌套和操作符
  _parseArguments(argString) {
    const args = [];
    let currentArg = "";
    let depth = 0;

    for (let i = 0; i < argString.length; i++) {
      const char = argString[i];

      if (char === "(") {
        depth++;
        currentArg += char;
      } else if (char === ")") {
        depth--;
        currentArg += char;
      } else if (char === "," && depth === 0) {
        // 参数分隔符在顶层时处理
        args.push(currentArg.trim());
        currentArg = "";
      } else {
        currentArg += char;
      }
    }

    // 最后的参数
    if (currentArg) {
      args.push(currentArg.trim());
    }

    return args;
  }

  // 检查参数的类型是否有效
  _isValidArgumentType(arg, validTypes) {
    const { variables, systemVariables, sheets, customVariableTypes } =
      this.dynamicUserData;

    const isVariable = variables.some((v) => v.display === arg);
    const isSystemVariable = systemVariables.some((sv) => sv.display === arg);
    const isSheetColumn = sheets.some((sheet) =>
      sheet.columns.some((col) => `${sheet.display}.${col.display}` === arg)
    );
    const isNumber = !isNaN(Number(arg));

    let isCustomVariable = false;
    Object.keys(customVariableTypes).forEach((type) => {
      const { allowedVariables = [], allowedSheets = [] } =
        customVariableTypes[type];
      const isCustomVar = allowedVariables.some(
        (variable) => `${type}${variable.display}` === arg
      );
      const isCustomSheetColumn = allowedSheets.some((sheet) =>
        sheet.columns.some(
          (col) => `${type}${sheet.display}.${col.display}` === arg
        )
      );
      if (isCustomVar || isCustomSheetColumn) {
        isCustomVariable = true;
      }
    });

    // 检查是否为表达式
    const isExpression = /[\+\-\*\/]/.test(arg) || /\w+\s*\(.+\)/.test(arg); // 简单正则匹配 +、-、*、/ 或 函数嵌套

    return (
      (validTypes.includes("variable") && isVariable) ||
      (validTypes.includes("systemVariable") && isSystemVariable) ||
      (validTypes.includes("sheetColumn") && isSheetColumn) ||
      (validTypes.includes("number") && isNumber) ||
      (validTypes.some((type) => type === arg.split(".")[0]) &&
        isCustomVariable) ||
      (validTypes.includes("expression") && isExpression)
    );
  }

  // 验证表达式的语法错误并高亮显示
  validateExpression() {
    const content = this.editor.getValue();
    const errors = this._performSyntaxCheck(content);

    if (errors.length > 0) {
      const markers = errors.map((error) => ({
        startLineNumber: error.line,
        startColumn: error.column,
        endLineNumber: error.line,
        endColumn: error.column + 1,
        message: error.message,
        severity: monaco.MarkerSeverity.Error,
      }));
      monaco.editor.setModelMarkers(this.editor.getModel(), "owner", markers);
    } else {
      monaco.editor.setModelMarkers(this.editor.getModel(), "owner", []);
    }
  }
}
