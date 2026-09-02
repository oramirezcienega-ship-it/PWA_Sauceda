const url = "https://crm-staging.saucedamx.com/login";
const actions = [
  "2f1ff6cd3ae669f6ddf5e39948ce7d50395909b8",
  "31b414a272c3431c89f120436e718bd05ae65053",
  "968af8d88f4e7bbce35244379c6cfffdffa8f4e2",
  "5119de58bba3331c50436a73d49cfbdd20fe4514",
  "7cf3b5f89a7993d76cd5fb3cfb23e312ea72820d",
  "ae91a394ad978202ab7fd50425528293255fbd22"
];

async function testAll() {
  for (const actionId of actions) {
    console.log(`Testing action ID: ${actionId}`);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Next-Action": actionId,
          "Content-Type": "text/plain;charset=UTF-8"
        },
        body: JSON.stringify(["alex_cordova_barajas@hotmail.com", "Sauceda2026!"])
      });

      const text = await response.text();
      console.log(`Status: ${response.status}`);
      console.log(`Response: ${text.slice(0, 300)}`);
      console.log(`Set-Cookie headers:`, response.headers.getSetCookie ? response.headers.getSetCookie() : response.headers.get("set-cookie"));
      console.log("-----------------------------------------");
    } catch (e) {
      console.error(e);
    }
  }
}

testAll();
