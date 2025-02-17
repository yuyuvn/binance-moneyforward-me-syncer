import {SourceBase, Asset} from '../base';
import Binance from 'node-binance-api';

interface BinanceSimpleEarnRowResponse {
  asset: string;
  amount: string;
  lockPeriod: string;
  type: 'NORMAL' | 'AUTO' | 'ACTIVITY' | 'TRIAL' | 'RESTAKE';
  status: 'SUCCESS' | 'PURCHASING' | 'FAILED';
}

interface BinanceSimpleEarnResponse {
  rows: Array<BinanceSimpleEarnRowResponse>;
  total: number;
}

interface BinanceSimpleEarnAccountResponse {
  totalAmountInUSDT: string;
  totalFlexibleAmountInBTC: string;
  totalFlexibleAmountInUSDT: string;
  totalLockedInBTC: string;
  totalLockedInUSDT: string;
}

/**
 * Config for binance source
 *
 * @interface BinanceSourceConfig
 */
export interface BinanceSourceConfig {
  apiKey?: string;
  secretKey?: string;
}

export class BinanceSource extends SourceBase<BinanceSourceConfig> {
  private binance: Binance;

  constructor(config: BinanceSourceConfig) {
    super(config);
    this.binance = new Binance().options({
      APIKEY: config.apiKey || process.env.BINANCE_API_KEY,
      APISECRET: config.secretKey || process.env.BINANCE_SECRET_KEY,
      useServerTime: true,
      family: 4,
    });
  }

  async fetch(): Promise<number> {
    await this.binance.useServerTime();
    const balances = await this.binance.balance();
    const ticker = await this.binance.prices();
    const UsdJpyRate = parseFloat(ticker['BTCJPY']) / parseFloat(ticker['BTCUSDT']);
    let walletBalanceUSD = 0;

    for (let currency in balances) {
      const balance = balances[currency];
      const available =
        parseFloat(balance.available) + parseFloat(balance.onOrder);
      if (available === 0.0) {
        continue;
      }

      // it's worthless
      if (currency === 'ETHW') continue;

      currency = currency.replace(/^LD/, '');

      if (currency.match(/USD/)) {
        walletBalanceUSD += available;
      } else {
        walletBalanceUSD += parseFloat(ticker[`${currency}USDT`]) * available;
      }
    }

    return walletBalanceUSD * UsdJpyRate;
  }

  async getFlexibleSubscriptionRecord(): Promise<BinanceSimpleEarnResponse> {
    return new Promise((resolve, reject) => {
      // @ts-ignore
      const callback = (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      };
      this.binance.signedRequest(
        'https://api.binance.com/sapi/v1/simple-earn/flexible/history/subscriptionRecord',
        {},
        // @ts-ignore
        callback
      );
    });
  }

  async getLockedSubscriptionRecord(): Promise<BinanceSimpleEarnResponse> {
    return new Promise((resolve, reject) => {
      // @ts-ignore
      const callback = (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      };
      this.binance.signedRequest(
        'https://api.binance.com/sapi/v1/simple-earn/locked/history/subscriptionRecord',
        {},
        // @ts-ignore
        callback
      );
    });
  }

  async getEarnBalance(): Promise<BinanceSimpleEarnAccountResponse> {
    return new Promise((resolve, reject) => {
      // @ts-ignore
      const callback = (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      };
      this.binance.signedRequest(
        'https://api.binance.com/sapi/v1/simple-earn/account',
        {},
        // @ts-ignore
        callback
      );
    })
  }

  public async getUSDJPYRate(ticker?: {[index: string]: string}): Promise<number> {
    ticker ||= await this.binance.prices();
    return parseFloat(ticker!['BTCJPY']) / parseFloat(ticker!['BTCUSDT']);
  }

  async fetchAll(): Promise<Asset[]> {
    await this.binance.useServerTime();
    const assetsHash: {[index: string]: Asset} = {};
    try {
      const balances = await this.binance.balance();
      const ticker = await this.binance.prices();
      const UsdJpyRate = await this.getUSDJPYRate(ticker);
      // const lockedSubscriptionRecord: BinanceSimpleEarnResponse =
      //   await this.getLockedSubscriptionRecord();
      // const flexibleSubscriptionRecord: BinanceSimpleEarnResponse =
      //   await this.getFlexibleSubscriptionRecord();

      for (let currency in balances) {
        const balance = balances[currency];
        const available =
          parseFloat(balance.available) + parseFloat(balance.onOrder);
        if (available === 0.0) {
          continue;
        }

        // it's worthless
        if (currency === 'ETHW') continue;

        currency = currency.replace(/^LD/, '');

        const asset = assetsHash[currency] || {name: currency, value: 0.0};
        if (currency.match(/JPY/)) {
          asset.value = available + asset.value;
        } else if (currency.match(/USD/)) {
          asset.value = available * UsdJpyRate + asset.value;
        } else {
          asset.value =
            parseFloat(ticker[`${currency}USDT`]) * available * UsdJpyRate +
            asset.value;
        }
        assetsHash[currency] = asset;
      }

      // for (const row of lockedSubscriptionRecord.rows) {
      //   const currency = row.asset;
      //   const available = parseFloat(row.amount);
      //   const asset = assetsHash[currency] || {name: currency, value: 0.0};
      //   if (row.status == 'FAILED' || row.type != 'NORMAL') {
      //     continue;
      //   }
      //   if (currency.match(/JPY/)) {
      //     asset.value = available + asset.value;
      //   } else if (currency.match(/USD/)) {
      //     asset.value = available * UsdJpyRate + asset.value;
      //   } else {
      //     if (currency == 'SOL') {
      //       console.log(
      //         parseFloat(ticker[`${currency}USDT`]),
      //         available,
      //         UsdJpyRate,
      //         asset.value
      //       );
      //     }
      //     asset.value =
      //       parseFloat(ticker[`${currency}USDT`]) * available * UsdJpyRate +
      //       asset.value;
      //   }
      // }

      // for (const row of flexibleSubscriptionRecord.rows) {
      //   const currency = row.asset;
      //   const available = parseFloat(row.amount);
      //   const asset = assetsHash[currency] || {name: currency, value: 0.0};
      //   if (row.status == 'FAILED' || row.type != 'NORMAL') {
      //     continue;
      //   }
      //   if (currency.match(/JPY/)) {
      //     asset.value = available + asset.value;
      //   } else if (currency.match(/USD/)) {
      //     asset.value = available * UsdJpyRate + asset.value;
      //   } else {
      //     asset.value =
      //       parseFloat(ticker[`${currency}USDT`]) * available * UsdJpyRate +
      //       asset.value;
      //   }
      // }
      const earnAccountBalance = parseFloat((await this.getEarnBalance()).totalLockedInUSDT);
      assetsHash['Earn'] = {name: 'Earn', value: earnAccountBalance * UsdJpyRate};
    } catch (err) {
      console.error(err);
      throw err;
    }

    return Object.values(assetsHash);
  }
}
