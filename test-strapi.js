// using native fetch

async function checkPages() {
  const url = 'http://127.0.0.1:1337/api/setup-site?locale=es&populate=*';
  try {
    const response = await fetch(url);
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    console.error(err);
  }
}

checkPages();
