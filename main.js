import puppeteer from 'puppeteer';
import YAML from 'yaml';
import fs from 'fs';

const config = YAML.parse(
    fs.readFileSync('config.yml', 'utf-8')
);

const TIME = parseInt(config['interval']) * 60 * 1000; // convert minutes to ms

async function racePromises(promises) {
    const wrappedPromises = [];
    promises.map((promise, index) => {
        wrappedPromises.push(
            new Promise((resolve) => {
                promise.then(() => {
                    resolve(index);
                })
            })
        )
    })
    return Promise.race(wrappedPromises);
}

(async () => {
    const browser = await puppeteer.launch({
        headless: false, // unfortunately, you can't use headless mode with Buster :(
        args: [
            "--start-maximized",
            "--disable-gpu",
            `--load-extension=${config['extensionPath']}`,
        ],
        executablePath: config['browserPath'],
        ignoreDefaultArgs: [
            "--disable-extensions",
            "--enable-automation"
        ],
        defaultViewport: null
    });

    const page = await browser.newPage();

    let vote = async () => {

        // go to page
        await page.goto(config['url']);

        // fill username
        const usernameInput = await page.waitForSelector("#username");
        await usernameInput.type(config['nick']);

        // accept privacy
        await page.click("#privacy");

        // click on recaptcha button
        const iframe = await(await page.$("iframe[title=reCAPTCHA]")).contentFrame();
        const recaptchaCheckbox = await iframe.waitForSelector(".recaptcha-checkbox");
        await recaptchaCheckbox.click();

        // race for success | captcha
        const result = await racePromises([
            page.waitForSelector("iframe[title='recaptcha challenge expires in two minutes']", { visible: true }),
            iframe.waitForSelector(".recaptcha-checkbox-checked")
        ]);

        // console.log(result);

        // if captcha => solve it lol
        if(result === 0) {
            // get another frame
            const _frame = await page.$("iframe[title='recaptcha challenge expires in two minutes']");
            const frame = await _frame.contentFrame();

            // buster captcha solver button
            const button = await frame.$(".help-button-holder");
            await button.click();

            // wait for solve
            await iframe.waitForSelector(".recaptcha-checkbox-checked");
        }

        // send form
        await page.click("button");

        // set timeout for 2 hours (recursive)
        setTimeout(vote, TIME);
    };

    await vote();
})()