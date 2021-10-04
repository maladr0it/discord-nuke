/// <reference lib="dom" />

(() => {
  //
  // Types + Consants
  //
  type Message = {
    "id": string;
    "channel_id": string;
    "content": string;
  };

  const POPUP_WIDTH = 400;
  const POPUP_HEIGHT = 400;
  const BASE_URL = "https://discord.com/api/v9";
  const REQUEST_DELAY = 2000;
  const THROTTLE_COOLDOWN = 30_000;

  //
  // Setup
  //
  const popup = window.open("", "", `top=0,left=0,width=${POPUP_WIDTH},height=${POPUP_HEIGHT}`);
  if (!popup) {
    console.error("Discord Nuke popup blocked, enable popups and try again.");
    return;
  }
  // Discord adds the user's token into localStorage before unloading
  self.dispatchEvent(new Event("beforeunload"));

  popup.document.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Discord Nuke</title>
    </head>
    <body>
      <form id="form">
        <div>
          <button id="token-autofill" type="button">Auto-fill</button>
          <div>
            <label for="token">Token:</label>
            <input id="token" name="token" type="text" />
          </div>
        </div>

        <div>
          <button id="author-autofill" type="button">Auto-fill</button>
          <div>
            <label for="author">Author:</label>
            <input id="author" name="author" type="text" />
          </div>
        </div>

        <div>
          <button id="channel-autofill" type="button">Auto-fill</button>
          <div>
            <label for="channel">Channel ID: </span>
            <input id="channel" name="channel" type="text" />
          </div>
        </div>

        <div>
          <button type="submit">Start</button>
          <button id="stop" type="button">Stop</button>
        </div>
      </form>

      <div>
        <button id="clear-log">Clear</button>
      </div>
      <ol id="log"></ol>
    </body>
    </html>
  `);

  const wait = (time: number) => new Promise((res) => setTimeout(res, time));
  const getEl = (id: string) => popup.document.getElementById(id);

  const form = getEl("form") as HTMLFormElement;
  const tokenInput = getEl("token") as HTMLInputElement;
  const tokenAutofillButton = getEl("token-autofill") as HTMLButtonElement;
  const authorInput = getEl("author") as HTMLInputElement;
  const authorAutofillButton = getEl("author-autofill") as HTMLButtonElement;
  const channelAutoFillButton = getEl("channel-autofill") as HTMLButtonElement;
  const channelInput = getEl("channel") as HTMLInputElement;
  const stopButton = getEl("stop") as HTMLButtonElement;
  const clearLogButton = getEl("clear-log") as HTMLButtonElement;
  const logList = getEl("log") as HTMLOListElement;

  tokenAutofillButton.addEventListener("click", () => {
    const token = JSON.parse(popup.localStorage.getItem("token") || "");
    tokenInput.value = token;
  });

  authorAutofillButton.addEventListener("click", () => {
    const userId = JSON.parse(popup.localStorage.getItem("user_id_cache") || "");
    authorInput.value = userId;
  });

  channelAutoFillButton.addEventListener("click", () => {
    const matches = location.href.match(/channels\/([^\/]+)\/([^\/]+)/);
    if (matches) {
      // unused guildID at matches[1]
      channelInput.value = matches[2];
    } else {
      log(
        `Unrecognized channel, navigate to the channel you'd like to nuke in the Discord window first.`,
      );
    }
  });

  stopButton.addEventListener("click", () => {
    stop();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    start(channelInput.value, authorInput.value, tokenInput.value);
  });

  clearLogButton.addEventListener("click", () => {
    clearLog();
  });

  popup.addEventListener("beforeunload", () => {
    stop();
  });

  //
  // Methods
  //
  let status: "RUNNING" | "STOPPED" | "COMPLETE" = "STOPPED";

  const log = (message: string) => {
    logList.insertAdjacentHTML("beforeend", `<li>${message}</li>`);
  };

  const clearLog = () => {
    logList.innerHTML = "";
  };

  const stop = () => {
    if (status === "RUNNING") {
      log(`Attempting to stop...`);
      status = "STOPPED";
    }
  };

  const start = async (channel: string, author: string, token: string) => {
    status = "RUNNING";

    while (status === "RUNNING") {
      await wait(REQUEST_DELAY);

      if (status !== "RUNNING") {
        break;
      }

      // Search for a chunk of messages
      const queryString = new URLSearchParams({ author_id: author }).toString();
      const searchResp = await fetch(
        `${BASE_URL}/channels/${channel}/messages/search?${queryString}`,
        { headers: { Authorization: token } },
      );
      if (!searchResp.ok) {
        const errorBody = await searchResp.json() as { message: string };
        log(`Error fetching messages: ${errorBody.message}`);
        return;
      }
      const searchResult = (await searchResp.json()) as {
        total_results: number;
        messages: Message[][];
      };

      // Delete messages
      for (const message of searchResult.messages.flat(1)) {
        await wait(REQUEST_DELAY);
        if (status !== "RUNNING") {
          break;
        }

        let deleteComplete = false;
        while (!deleteComplete) {
          const deleteResp = await fetch(
            `${BASE_URL}/channels/${message.channel_id}/messages/${message.id}`,
            { headers: { Authorization: token }, method: "DELETE" },
          );

          if (!deleteResp.ok) {
            if (deleteResp.status === 429) {
              const errorBody = await deleteResp.json() as { retry_after: number };
              log(`Too many requests, attempting again after ${errorBody.retry_after}`);
              await wait(THROTTLE_COOLDOWN);
              continue;
            }
            const errorBody = await deleteResp.json() as { message: string };
            log(`Error deleting message: ${errorBody.message}`);
            return;
          }

          log(`Deleted message: ${message.content}`);
          deleteComplete = true;
        }
      }

      if (searchResult.total_results === 0) {
        status = "COMPLETE";
      }
    }

    // Report reason for loop ending
    if (status === "COMPLETE") {
      log(`All messages deleted.`);
    } else {
      log(`Stopped by user.`);
    }
  };
})();
