(function () {
  const status = document.getElementById("status");
  const log = document.getElementById("log");

  function setStatus(text) {
    if (status) status.textContent = text;
  }

  function appendLog(text) {
    if (!log) return;
    const old = log.textContent || "";
    log.textContent = old ? `${old}\n${text}` : text;
  }

  function waitForAppBoot(timeoutMs = 15000) {
    if (window.__APP_BOOTED__) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      let done = false;
      const timer = window.setTimeout(() => {
        if (done) return;
        done = true;
        window.removeEventListener("app-booted", onBooted);
        resolve(false);
      }, timeoutMs);

      function onBooted() {
        if (done) return;
        done = true;
        clearTimeout(timer);
        window.removeEventListener("app-booted", onBooted);
        resolve(true);
      }

      window.addEventListener("app-booted", onBooted, { once: true });
    });
  }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = url;
      s.async = false;
      s.onload = () => resolve(url);
      s.onerror = () => reject(new Error(`加载失败: ${url}`));
      document.body.appendChild(s);
    });
  }

  async function loadWithFallback(name, urls) {
    let lastError = null;
    for (const url of urls) {
      try {
        setStatus(`加载依赖中: ${name}`);
        await loadScript(url);
        appendLog(`[依赖] ${name} <- ${url}`);
        return url;
      } catch (err) {
        lastError = err;
        appendLog(`[失败] ${name} <- ${url}`);
      }
    }
    throw lastError || new Error(`无法加载依赖: ${name}`);
  }

  async function start() {
    try {
      appendLog("[引导] bootstrap_cn_v1 已启动");
      setStatus("正在加载前端依赖...");

      if (!HTMLScriptElement.supports?.("importmap")) {
        throw new Error("当前浏览器不支持 importmap，无法解析 three 等裸模块名。请升级浏览器。 ");
      }

      window.addEventListener("error", (event) => {
        const msg = event?.message || "未知脚本错误";
        appendLog(`[错误] ${msg}`);
      });

      window.addEventListener("unhandledrejection", (event) => {
        const reason = event?.reason;
        const msg = reason?.message || String(reason || "未知 Promise 拒绝");
        appendLog(`[错误] Promise 未处理拒绝: ${msg}`);
      });

      await loadWithFallback("dicom-parser", [
        "dicomParser.min.js",
        "https://unpkg.com/dicom-parser@1.8.21/dist/dicomParser.min.js"
      ]);

      setStatus("依赖加载完成，正在启动应用...");
      await loadModule("./app.js");

      const booted = await waitForAppBoot(15000);
      if (!booted) {
        setStatus("应用启动耗时较长或失败，请查看日志。 ");
        appendLog("[警告] 未在 15 秒内收到 app-booted 事件。");
      }
    } catch (err) {
      setStatus("启动失败，请查看日志中的具体错误。 ");
      appendLog(`[致命] ${err && err.message ? err.message : String(err)}`);
      if (err && err.stack) {
        appendLog(`[致命] 堆栈: ${err.stack}`);
      }
    }
  }

  async function loadModule(url) {
    try {
      await import(url);
    } catch (err) {
      const detail = err && err.message ? err.message : String(err);
      appendLog(`[模块错误] ${url}`);
      appendLog(`[模块错误] ${detail}`);
      throw new Error(`加载失败: ${url} -> ${detail}`);
    }
  }

  start();
})();
