const vscode = require("vscode");

class SidebarProvider {
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
    }

    resolveWebviewView(webviewView) {
      this._view = webviewView;

      webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [this._extensionUri],
      };

      webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

      webviewView.webview.onDidReceiveMessage(message => {
        if (message.command === 'toggleSuggestion') {
          this.toggleSuggestion(message.code, message.line);
        }
      });

      webviewView.webview.onDidReceiveMessage(async (data) => {
        switch (data.type) {
          case "onFetchText": {
            let editor = vscode.window.activeTextEditor;

            if (editor === undefined) {
              vscode.window.showErrorMessage('No active text editor');
              return;
            }

            let text = editor.document.getText(editor.selection);
            this._view?.webview.postMessage({ type: "onSelectedText", value: text });
            break;
          }
          case "onInfo": {
            if (!data.value) {
              return;
            }
            vscode.window.showInformationMessage(data.value);
            break;
          }
          case "onError": {
            if (!data.value) {
              return;
            }
            vscode.window.showErrorMessage(data.value);
            break;
          }
        }
      });
    }

    toggleSuggestion(code, line) {
      const editor = vscode.window.activeTextEditor;
      var lineNumber = Number(line)
      var before = lineNumber - 1

      if (editor) {
        editor.edit(editBuilder => {
          editBuilder.insert(new vscode.Position(before, 0), '<<<<<<< HEAD\n');
          editBuilder.insert(new vscode.Position(lineNumber, 0), '=======\n' + code + '\n>>>>>>> Suggested Fix\n');
        })
      }
    }

    revive(panel) {
      this._view = panel;
    }

    _getHtmlForWebview(webview) {
        /*html*/
        return `
          <!DOCTYPE html>
            <html lang="en">
            <head>
              <style>
                .list_item {
                  padding: 10px;
                  background-color: #1c2433;
                  margin-bottom: 10px;
                  border-radius: 5px;
                }

                .list_item > p {
                  margin: 0px;
                  padding: 0px;
                  font-weight: 600;
                  display: -webkit-box;
                  text-overflow: ellipsis;
                  overflow: hidden;
                  -webkit-box-orient: vertical;
                  -webkit-line-clamp: 3;
                }
                
                .list_item button {
                  background-color: #6b77fd;
                  color: white;
                  padding: 5px 10px;
                  border: none;
                  margin-top: 10px;
                  display: flex;
                  margin-left: auto;
                  cursor: pointer;
                }
              </style>

              <script>
                var code = [
                  "===== code =====",
                  "import React, { useState } from 'react';",
                  "",
                  "function BugComponent(){",
                  "  const [count, setCount] = useState(0);",
                  "  const handleIncrement = () => {",
                  "    setCount(count + 1);  ",
                  "  };",
                  "  return (",
                  "    <div>",
                  "      <h1>Buggy React Component</h1>",
                  "      <p>Current count: {count}</p>",
                  "      <button onClick={handleIncrement}>Increment</button>",
                  "    </div>",
                  "  );",
                  "}",
                  "",
                  "export function BugComponent;",
                  "==========",
                ].join("\\n");

                const bugList = [
                  {
                    title: "Bug 1",
                    code: code,
                    stack_trace: "Stacktrace: TypeError: Invalid attempt to destructure non-iterable instance at BugComponent (BugComponent.js:4)",
                    line: 4,
                  },
                  {
                    title: "Bug 2",
                    code: code,
                    stack_trace: "Stacktrace: SyntaxError: Unexpected token ';'. Expected a declaration (8:22) at BugComponent.js:16",
                    line: 16,
                  },
                ]

                function renderBugList() {
                  var list = document.getElementById("bug_list");
                  bugList.forEach((bug) => {
                    var item = document.createElement("div");
                    item.className = "list_item";
                    item.innerHTML = '<p data-code="' + bug.code + '" data-line="' + bug.line + '">' + bug.stack_trace + '</p><button onclick="callOpenAi()"">Suggest Fix</button>';
                    list.appendChild(item);
                  })
                }

                window.onload = function() {
                  renderBugList();
                }

                const vscode = acquireVsCodeApi();

                function callOpenAi() {
                  var stack_trace = event.target.parentElement.innerText;
                  var code = event.target.parentElement.querySelector('p').getAttribute("data-code");
                  var line = event.target.parentElement.querySelector('p').getAttribute("data-line");

                  var myHeaders = new Headers();
                  var token = "INSERT TOKEN HERE";
                  myHeaders.append("Content-Type", "application/json");
                  myHeaders.append("Accept", "application/json");
                  myHeaders.append("Authorization", "Bearer " + token);

                  const raw = JSON.stringify(
                    {
                      "model": "gpt-3.5-turbo",
                      "messages": [
                        {
                          "role": "user",
                          "content": stack_trace
                        },
                        {
                          "role": "user",
                          "content": code
                        },
                        {
                          "role": "user",
                          "content": "look at the stack trace and code referenced in this message and respond in valid JSON where the first key is 'human_readable_error' and value is a detailed 2 sentence explanation of the error and how the following code_suggestion will fix the issue, and the second key is 'code_suggestion' and the value is ONLY valid Javascript that could be replaced with the entire relevant line without ANY explanation or instruction, just code"
                        },    
                      ],
                      "temperature": 0.5,
                      "top_p": 1,
                      "n": 1,
                      "stream": false,
                      "max_tokens": 2000,
                      "presence_penalty": 0,
                      "frequency_penalty": 0
                    }
                  )

                  var requestOptions = {
                    method: 'POST',
                    headers: myHeaders,
                    body: raw,
                    redirect: 'manual'
                  };
                  
                  fetch("https://api.openai.com/v1/chat/completions", requestOptions)
                  .then(response => response.text())
                  .then(result => {
                    var json = JSON.parse(result);
                    var results = document.getElementById("results");
                    var resultsP = results.getElementsByTagName("p")[0];
                    var resultsCode = results.getElementsByTagName("code")[0];
                    var code = JSON.parse(json.choices[0].message.content);
                    resultsP.innerHTML = code.human_readable_error;
                    resultsCode.innerHTML = code.code_suggestion;

                    vscode.postMessage({ command: 'toggleSuggestion', code: code.code_suggestion, line: line });
                  })
                  .catch(error => console.log('error', error));
                }
              </script>
            </head>
            <body>
              <div id="app">
                <h4>BUGS</h4>
                <div id="bug_list"></div>

                <div id="results">
                  <h4>RESULTS</h4>
                  <p></p>
                  <code class="language-javascript"></code>
                </div>
              </div>
              <script>
              </script>
            </body>
          </html>
        `;
    }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

module.exports = SidebarProvider;
