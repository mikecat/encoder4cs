"use strict";

window.addEventListener("DOMContentLoaded", () => {
	// 各 UI 要素を取得する
	const elements = (() => {
		const elements = {};
		document.querySelectorAll("[id]").forEach((element) => {
			elements[element.id] = element;
		});
		return elements;
	})();

	// コマンドやデータを一発でコピーするボタンを設置する
	const addCopyButton = (inputElement) => {
		if (!navigator.clipboard || !navigator.clipboard.writeText) return;
		const copyIndicator = document.createElement("span");
		copyIndicator.classList.add("copy-indicator");
		copyIndicator.appendChild(document.createTextNode("コピーしました。"));
		const button = document.createElement("button");
		button.setAttribute("type", "button");
		button.appendChild(document.createTextNode("コピー"));
		inputElement.parentNode.insertBefore(copyIndicator, inputElement.nextSibling);
		inputElement.parentNode.insertBefore(button, copyIndicator);
		inputElement.parentNode.insertBefore(document.createElement("br"), button);
		let removeIndicatorTimer = null;
		button.addEventListener("click", () => {
			navigator.clipboard.writeText(inputElement.value).then(() => {
				document.querySelectorAll(".copy-indicator").forEach((element) => {
					element.classList.remove("active");
					element.classList.remove("latest");
				});
				copyIndicator.classList.add("active");
				if (removeIndicatorTimer !== null) clearTimeout(removeIndicatorTimer);
				removeIndicatorTimer = setTimeout(() => {
					copyIndicator.classList.remove("active");
					copyIndicator.classList.add("latest");
					removeIndicatorTimer = null;
				}, 1000);
			});
		});
	};
	document.querySelectorAll(".copyable-area").forEach((element) => {
		addCopyButton(element);
	});

	// 設定を localStorage に保存する
	if (localStorage) {
		const storageKey = "encoder4cs-config-f7530cde-755c-46cc-b4e0-d62d0a1f7c0d";
		try {
			const configText = localStorage.getItem(storageKey);
			if (configText) {
				const config = JSON.parse(configText);
				if (config) {
					if (typeof config.useInputFileNameForSave === "boolean") {
						elements.use_input_file_name_for_save.checked = config.useInputFileNameForSave;
					}
					if (typeof config.useTailInCommand === "boolean") {
						elements.use_tail_in_command.checked = config.useTailInCommand;
					}
					if (typeof config.splitEncodedData === "boolean") {
						elements.split_encoded_data.checked = config.splitEncodedData;
					}
					if (typeof config.linesPerSplittedBlock === "number" &&
					!isNaN(config.linesPerSplittedBlock) &&
					Math.floor(config.linesPerSplittedBlock) === config.linesPerSplittedBlock && // 整数である
					config.linesPerSplittedBlock > 0) {
						elements.lines_per_splitted_block.value = config.linesPerSplittedBlock;
					}
				}
			}
		} catch (e) {
			console.warn(e);
		}
		const saveConfig = () => {
			try {
				const config = {};
				config.useInputFileNameForSave = elements.use_input_file_name_for_save.checked;
				config.useTailInCommand = elements.use_tail_in_command.checked;
				config.splitEncodedData = elements.split_encoded_data.checked;
				const linesPerSplittedBlock = parseInt(elements.lines_per_splitted_block.value, 10);
				if (!isNaN(linesPerSplittedBlock) && linesPerSplittedBlock > 0) {
					config.linesPerSplittedBlock = linesPerSplittedBlock;
				}
				localStorage.setItem(storageKey, JSON.stringify(config));
			} catch (e) {
				console.warn(e);
			}
		};
		elements.use_input_file_name_for_save.addEventListener("change", saveConfig);
		elements.use_tail_in_command.addEventListener("change", saveConfig);
		elements.split_encoded_data.addEventListener("change", saveConfig);
		elements.lines_per_splitted_block.addEventListener("change", saveConfig);
	}

	// エンコードを行う
	let latestEncodeId = 0;
	let latestEncodedFileName = "", latestEncodedNativeFileName = "";
	let latestEncodedLines = [];
	const showEncodeResult = () => {
		// コマンドを表示する
		let fileName = elements.use_input_file_name_for_save.checked ? latestEncodedNativeFileName : latestEncodedFileName;
		if (fileName !== "") {
			if (!/^[0-9a-zA-Z._-]+$/.test(fileName)) {
				fileName = fileName.replace(/\\/g, "\\\\");
				fileName = fileName.replace(/`/g, "\\`");
				fileName = fileName.replace(/"/g, "\\\"");
				fileName = fileName.replace(/\$/g, "\\$");
				fileName = fileName.replace(/!/g, "\\!");
				fileName = "\"" + fileName + "\"";
			}
			fileName = " > " + fileName;
		}
		let command = "perl encoder4cs-decode.pl" + fileName;
		if (elements.use_tail_in_command.checked) {
			command = "tail -n " + latestEncodedLines.length + " | " + command;
		}
		elements.decode_command.value = command;

		// データを表示する
		while (elements.encode_result_area.firstChild) {
			elements.encode_result_area.removeChild(elements.encode_result_area.firstChild);
		}
		const linesPerSplittedBlock = parseInt(elements.lines_per_splitted_block.value, 10);
		let lines = "";
		for (let i = 0; i < latestEncodedLines.length; i++) {
			if (i < latestEncodedLines.length) lines += latestEncodedLines[i] + "\n";
			if ((elements.split_encoded_data.checked && !isNaN(linesPerSplittedBlock) && linesPerSplittedBlock > 0 && (i + 1) % linesPerSplittedBlock === 0) ||
			i >= latestEncodedLines.length - 1) {
				const p = document.createElement("p");
				const textarea = document.createElement("textarea");
				textarea.setAttribute("rows", "5");
				textarea.setAttribute("cols", "85");
				textarea.setAttribute("readonly", "readonly");
				textarea.value = lines;
				p.appendChild(textarea);
				elements.encode_result_area.appendChild(p);
				addCopyButton(textarea);
				lines = "";
			}
		}
	};
	const blockLength = 60; // ブロック1個の入力バイト数
	const blockSetNum = 4; // ブロックを何行ずつ繰り返すか
	const redundantMult = 2; // ブロックのセットを何回繰り返すか
	const setLength = blockLength * blockSetNum;
	const blockLengthOut = Math.floor((blockLength * 4 + 2) / 3);
	const encode = (blob, name, nativeName) => {
		const currentEncodeId = ++latestEncodeId;
		new Response(blob.stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer().then((compressedDataBuffer) => {
			if (latestEncodeId === currentEncodeId) {
				const compressedData = new Uint8Array(compressedDataBuffer);
				latestEncodedFileName = name;
				latestEncodedNativeFileName = nativeName;
				latestEncodedLines = [];
				for (let offset = 0; offset < compressedData.length; offset += setLength) {
					const encodedRaw = btoa(Array.from(compressedData.slice(offset, offset + setLength)).map((c) => String.fromCharCode(c)).join(""));
					const encoded = encodedRaw + "=".repeat(blockLengthOut * blockSetNum - encodedRaw.length);
					for (let i = 0; i < blockSetNum * redundantMult; i++) {
						const b = i % blockSetNum;
						const c = String.fromCharCode(0x21 + i);
						const e = encoded.substring(blockLengthOut * b, blockLengthOut * (b + 1));
						latestEncodedLines.push(c + c +  e + c + c);
					}
				}
				showEncodeResult();
			}
		}).catch((error) => {
			console.error(error);
			if (currentEncodeId === latestEncodeId) {
				alert("エンコードに失敗しました。");
			}
		});
	};

	// 入力されたテキストを Blob にしてエンコードを行う
	const encodeText = () => {
		const text = elements.input_textarea.value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
		elements.input_textarea.placeholder = "";
		encode(new Blob([text]), elements.input_save_file_name.value, elements.input_save_file_name.value);
	};
	elements.input_textarea.addEventListener("change", () => {
		encodeText();
	});
	// 指定のファイルを用いてエンコードを行う
	const encodeFile = (file) => {
		const fileSizeText = (() => {
			if (file.size < 1024) return file.size + " B";
			if (file.size < 1024 * 1024) return (file.size / 1024).toFixed(2) + " KiB";
			if (file.size < 1024 * 1024 * 1024) return (file.size / (1024 * 1024)).toFixed(2) + " MiB";
			return (file.size / (1024 * 1024 * 1024)).toFixed(2) + " GiB";
		})();
		elements.input_textarea.value = "";
		elements.input_textarea.placeholder = file.name + " (" + fileSizeText + ")";
		encode(file, elements.input_save_file_name.value, file.name);
	};
	// ファイルがドロップされたら、そのファイルのエンコードを行う
	elements.input_textarea.addEventListener("dragover", (event) => {
		const dt = event.dataTransfer;
		if (dt.types.indexOf("Files") >= 0) {
			event.preventDefault();
			dt.dropEffect = "copy";
		}
	});
	elements.input_textarea.addEventListener("drop", (event) => {
		const dt = event.dataTransfer;
		if (dt.types.indexOf("Files") >= 0 && dt.files.length > 0) {
			event.preventDefault();
			encodeFile(dt.files[0]);
		}
	});
	// ファイルを選択してエンコードを行う
	elements.input_select_file.addEventListener("click", () => {
		const input = document.createElement("input");
		input.setAttribute("type", "file");
		input.addEventListener("change", () => {
			if (input.files.length > 0) {
				encodeFile(input.files[0]);
			}
		});
		input.click();
	});

	// 設定の変更をエンコード結果の表示に反映する
	elements.input_save_file_name.addEventListener("change", showEncodeResult);
	elements.use_input_file_name_for_save.addEventListener("change", showEncodeResult);
	elements.use_tail_in_command.addEventListener("change", showEncodeResult);
	elements.split_encoded_data.addEventListener("change", showEncodeResult);
	elements.lines_per_splitted_block.addEventListener("change", showEncodeResult);

	// 初期表示用にエンコードを行う
	encodeText();
});
