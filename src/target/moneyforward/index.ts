import fs from 'fs';
import {Asset} from '../../sources/base';
import puppeteer, {
  PuppeteerLaunchOptions,
  Page,
  Browser,
  ElementHandle,
} from 'puppeteer';

let debugCount = 0;

interface MoneyforwardCashAccountConfig {
  email?: string;
  password?: string;
  puppeteerOptions?: PuppeteerLaunchOptions;
  debug?: boolean;
}

export class MoneyforwardCashAccount {
  private config: MoneyforwardCashAccountConfig;
  private initiated: boolean;
  private browser?: Browser;
  private page?: Page;

  /**
   * Creates an instance of MoneyforwardCashAccount
   * @param {MoneyforwardCashAccountConfig} config
   * @memberof MoneyforwardCashAccount
   */
  constructor(config: MoneyforwardCashAccountConfig) {
    this.config = {
      email: process.env.MONEYFORWARD_USER,
      password: process.env.MONEYFORWARD_PASSWORD,
      puppeteerOptions: {},
      debug: false,
      ...config,
    };
    this.initiated = false;
  }

  /**
   * Update current balance for a manual account
   *
   * @param {string} account
   * @param {Asset[]} assets
   * @memberof MoneyforwardCashAccount
   */
  public async updateCryptoBalance(account: string, assets: Asset[]) {
    if (!this.initiated) await this.initiate();

    const page = this.page!;

    try {
      await page.goto('https://moneyforward.com/accounts');
      await (
        (await page.waitForSelector(
          `xpath/.//section[@class='manual_accounts']//a[contains(., '${account}')]`
        )) as ElementHandle<Element>
      )?.click();

      for (const asset of assets) {
        await page.waitForSelector("xpath/.//a[contains(., '手入力で資産を追加')]", {
          visible: true,
        });
        const [row] = await page.$$(
          `xpath/.//table[@id="TABLE_1"]//tr[contains(., "${asset.name}")]`
        );
        if (row) {
          await (await row.waitForSelector('.btn-asset-action'))?.click();
        } else {
          await (
            (await page.waitForSelector("xpath/.//a[contains(., '手入力で資産を追加')]", {
              visible: true,
            })) as ElementHandle<Element>
          )?.click();
          await page.select(
            'div.modal.in #user_asset_det_asset_subclass_id',
            '66'
          ); // 暗号資産
          await page.type('div.modal.in #user_asset_det_name', asset.name);
        }
        await page.waitForSelector('div.modal.in #user_asset_det_value', {
          visible: true,
        });
        await page.evaluate(selector => {
          (document.querySelector(selector) as HTMLInputElement).value = '';
        }, 'div.modal.in input[name="user_asset_det[value]"]');
        await (
          await page.waitForSelector('div.modal.in #user_asset_det_value', {
            visible: true,
          })
        )?.type(Math.round(asset.value).toString());
        if (asset.bought) {
          await (
            await page.waitForSelector(
              'div.modal.in #user_asset_det_entried_price',
              {
                visible: true,
              }
            )
          )?.type(Math.round(asset.bought).toString());
        }
        await (
          await page.waitForSelector(
            'div.modal.in input[value="この内容で登録する"]',
            {
              visible: true,
            }
          )
        )?.click();
      }
    } catch (error) {
      await this.debug(error as Error);
      throw error;
    }
  }

  /**
   * Update digital pay balance for a manual account
   *
   * @param {string} account
   * @param {numer} balance
   * @memberof MoneyforwardCashAccount
   */
  public async updatePayBalance(account: string, balance: number) {
    if (!this.initiated) await this.initiate();

    const page = this.page!;

    try {
      await page.goto('https://moneyforward.com/accounts');
      await (
        (await page.waitForSelector(
          `xpath/.//section[@class='manual_accounts']//a[contains(., '${account}')]`
        )) as ElementHandle<Element>
      )?.click();

      await page.waitForSelector("xpath/.//h1[contains(., '残高推移')]", {
        visible: true,
      });

      await (await page.waitForSelector('.heading-small > .btn-success.btn'))?.click();

      await (
        await page.waitForSelector('#rollover_info_value', {
          visible: true,
        })
      )?.type(balance.toString());
      await (
        await page.waitForSelector(
          '.controls > .btn-success.btn',
          {
            visible: true,
          }
        )
      )?.click();
    } catch (error) {
      await this.debug(error as Error);
      throw error;
    }
  }

  /**
   * Close chrome
   *
   * @return {*}
   * @memberof MoneyforwardCashAccount
   */
  public finalize() {
    if (!this.browser) return;

    this.browser.close();
  }

  /**
   * Prepair chromedriver and login to Moneyforward
   *
   * @private
   * @memberof MoneyforwardCashAccount
   */
  private async initiate() {
    const puppeteerOptions: PuppeteerLaunchOptions = {
      headless: true,
      slowMo: 100,
      executablePath: process.env.CHRONIUM_BINARY_PATH,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
      ...this.config.puppeteerOptions,
    };
    this.browser = await puppeteer.launch(puppeteerOptions);
    this.page = await this.browser.newPage();
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:70.0) Gecko/20100101 Firefox/70.0'
    );
    this.page.on('dialog', async (dialog: any) => {
      await dialog.accept();
    });
    await this.login(this.page);
    this.initiated = true;
  }

  /**
   * Login to Moneyforward
   *
   * @private
   * @param {Page} page
   * @memberof MoneyforwardCashAccount
   */
  private async login(page: Page) {
    try {
      await page.goto('https://moneyforward.com/login');
      await (
        await page.waitForSelector('a.link-btn-reg', {
          visible: true,
        })
      )?.click();
      await (
        await page.waitForSelector('[id="mfid_user[email]"]', {
          visible: true,
        })
      )?.type(this.config.email!);
      await (
        await page.waitForSelector('#submitto', {
          visible: true,
        })
      )?.click();
      await (
        await page.waitForSelector('[id="mfid_user[password]"]', {
          visible: true,
        })
      )?.type(this.config.password!);
      await (
        await page.waitForSelector('#submitto', {
          visible: true,
        })
      )?.click();
      await page.waitForSelector('.right-nav', {
        visible: true,
      });
    } catch (error) {
      await this.debug(error as Error);
      throw error;
    }
  }

  /**
   * Wait for X miliseconds
   *
   * @private
   * @param {number} miliseconds
   * @memberof MoneyforwardCashAccount
   */
  private async wait(miliseconds: number) {
    await new Promise(r => setTimeout(r, miliseconds));
  }

  /**
   * Take screenshot and dump html of current page.
   *
   * @private
   * @param {Error} [error]
   * @return {*}
   * @memberof MoneyforwardCashAccount
   */
  private async debug(error?: Error) {
    if (!this.config.debug) return;

    if (!error) {
      const stack = new Error().stack?.split('\n')[2];
      console.debug('Debug:', stack);
    }
    console.log('Current url:', this.page?.url());
    const currentFolder = process.cwd();
    const html = await this.page?.content();
    fs.writeFileSync(
      `${currentFolder}/debug_${debugCount}.html`,
      html || 'null'
    );
    await this.page!.screenshot({
      path: `${currentFolder}/debug_${debugCount}.png`,
      fullPage: true,
    });
    console.debug(
      'Screenshot saved at',
      `${currentFolder}/debug_${debugCount}.png`
    );
    debugCount += 1;
  }
}
