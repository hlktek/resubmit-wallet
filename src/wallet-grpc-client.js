const { WALLET_SERVER_HOST } = require('./config');
const grpc = require('grpc');
const protoLoader = require('@grpc/proto-loader');
const bluebird = require('bluebird');

const GPRC_OPTIONS = {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
}

const walletProto = 'src/proto/wallet.proto';

const packageDefinition = protoLoader.loadSync(walletProto, GPRC_OPTIONS);
const WalletService = grpc.loadPackageDefinition(packageDefinition).WalletService;
const client = new WalletService(WALLET_SERVER_HOST, grpc.credentials.createInsecure());

bluebird.promisifyAll(client);

module.exports = client;
