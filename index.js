const fs = require("fs");
const { fromHex } = require("@cosmjs/encoding");
const { DirectSecp256k1Wallet } = require("@cosmjs/proto-signing");
const { SigningStargateClient, GasPrice } = require("@cosmjs/stargate");

const rpcEndpoint = "https://testnet-rpc.zigchain.com";
const chainId = "zig-test-2";
const denom = "uzig";
const displayDenom = "ZIG";
const decimalPrecision = 6;
const gasPrice = GasPrice.fromString("0.025uzig");
const gasLimit = 200000;
const feeAmount = Math.ceil(0.025 * gasLimit); // = 5000 uzig

const recipient = "zig1zlckh4dapq35x20thfe0gmn0ewgntpq7euzwcf";

function formatZIG(amount) {
  return (amount / 10 ** decimalPrecision).toFixed(6);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function logWithTime(msg) {
  const now = new Date().toISOString();
  console.log(`[${now}] ${msg}`);
}

async function sendAllFromPK(pkHex) {
  const pk = fromHex(pkHex.trim());
  const wallet = await DirectSecp256k1Wallet.fromKey(pk, "zig");
  const [account] = await wallet.getAccounts();
  const address = account.address;

  const client = await SigningStargateClient.connectWithSigner(rpcEndpoint, wallet, {
    gasPrice,
  });

  try {
    const balance = await client.getBalance(address, denom);
    const totalBalance = parseInt(balance.amount);

    if (totalBalance <= feeAmount) {
      logWithTime(`[SKIP] ${address} | saldo terlalu kecil: ${formatZIG(totalBalance)} ${displayDenom}`);
      return;
    }

    const sendAmount = totalBalance - feeAmount;

    logWithTime(`[SEND] ${address} => ${recipient} | ${formatZIG(sendAmount)} ${displayDenom}`);

    const result = await client.sendTokens(
      address,
      recipient,
      [{ denom, amount: sendAmount.toString() }],
      {
        amount: [{ denom, amount: feeAmount.toString() }],
        gas: gasLimit.toString(),
      }
    );

    logWithTime(`[OK] TX Hash: https://zigscan.org/tx/${result.transactionHash}`);
  } catch (err) {
    throw err;
  } finally {
    await client.disconnect();
  }
}

async function sendAllWithRetry(pk, retries = 3, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      await sendAllFromPK(pk);
      break;
    } catch (err) {
      if (err.message.includes("429")) {
        logWithTime(`[RETRY] Rate limit. Retry ${i + 1}/${retries} after ${delayMs}ms`);
        await sleep(delayMs);
        delayMs *= 2;
      } else {
        logWithTime(`[ERR] ${err.message}`);
        break;
      }
    }
  }
}

async function main() {
  const pks = fs.readFileSync("pk.txt", "utf-8").split("\n").filter(Boolean);
  for (const pk of pks) {
    await sendAllWithRetry(pk);
    await sleep(2000); // Delay antar wallet
  }
}

main();
