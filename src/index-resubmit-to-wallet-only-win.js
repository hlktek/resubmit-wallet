require('dotenv').config();
const config = require('./config');

const fs = require('fs');
const readline = require('readline');
const axios = require('axios').default;

const walletClient = require('./wallet-grpc-client');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const ticketIdFileName = 'ticket-id-list.txt';
const ticketIdFilePath = `${__dirname}/../${ticketIdFileName}`;
const readInterface = readline.createInterface({
    input: fs.createReadStream(ticketIdFilePath),
    console: false
});


const listTicketIds = [];
const resubmitInfo = [];
readInterface.on('line', function(line) {
    listTicketIds.push(line)
});
readInterface.on('close', function(){
    console.log(`Read file ${ticketIdFileName} success: ${listTicketIds.length} ticketIds`);
    // console.log(listTicketIds);
    run();
})

async function run() {
    for (let i = 0; i < listTicketIds.length; i++) {
        const ticketId = listTicketIds[i];
        console.log('Process ticket:', i, '-', ticketId);
        await resubmit(ticketId);
    }
    exportCSV();
}

async function resubmit(ticketId) {
    const ticketInfo = await getTicketInfo(ticketId);
    if (ticketInfo && ticketInfo.length > 0) {
        const request = ticketInfo[0];
        if (request.action === 'WIN') {
            const callGamemsResult = await callWallet(ticketInfo);
            resubmitInfo.push({
                ticketId,
                userId : request.uid,
                action : request.action,
                amount : request.amount,
                resubmit : callGamemsResult
            })
        } else {
            resubmitInfo.push({
                ticketId,
                userId : request.uid,
                action : require.action,
                amount : request.amount,
                resubmit : 'NOT_RUN'
            })
        }
    } else {
        resubmitInfo.push({
            ticketId,
            userId : 'N/A',
            action : 'N/A',
            amount : 'N/A',
            resubmit : 'NOT_FOUND'
        })
    }
}

async function getTicketInfo(ticketId) {
    try {
        const responsse = await axios({
            url : `${config.ES_HOST}/${config.ES_WALLET_INDEX}/_search`,
            method : 'post',
            data : {
                "query": {
                    "bool": {
                        "must": [
                            {
                                "match": {
                                    "logInfo.request.data.game_ticket_id.keyword": ticketId
                                }
                            }
                        ],
                        "must_not": [],
                        "should": []
                    }
                },
                "from": 0,
                "size": 1,
                "sort": [
                    {
                        "timeUTC": "desc"
                    }
                ],
                "aggs": {}
            }
        })

        if (responsse.status === 200) {
            const sources = responsse.data.hits.hits;

            if (sources && sources.length > 0) {
                return sources[0]._source.logInfo.request;
            }
        }
    } catch (err) {
        console.error(err.message);
        return null;
    }
}

async function callWallet(requests) {
    try {
        if (requests && requests.length > 0) {
            const ticketInfo = requests[0];
            const response = await walletClient.transferAsync({
                "userId": ticketInfo.uid,
                "transfers": [
                {
                    "transactionId": ticketInfo.transaction_id,
                    "referenceId": ticketInfo.reference_id,
                    "amount": ticketInfo.amount,
                    "action": ticketInfo.action,
                    "data": {
                        gameId : ticketInfo.data.game_id,
                        gameName : ticketInfo.data.game_name,
                        gameRoundId : ticketInfo.data.game_round_id,
                        gameTicketId : ticketInfo.data.game_ticket_id,
                        gameTicketStatus : ticketInfo.data.game_ticket_status,
                        gameYourBet : ticketInfo.data.game_your_bet,
                        gameStake : ticketInfo.data.game_stake,
                        gameWinLost : ticketInfo.data.game_winlost,
                        gameGain : ticketInfo.data.game_gain,
                        gameTax : ticketInfo.data.game_tax,
                        commitType : ticketInfo.option,
                        currentResult : ticketInfo.data.current_result,
                        isAddOnGame : ticketInfo.data.is_add_on_game,
                        isFinished : ticketInfo.data.is_finished,
                        gameBetValue : ticketInfo.data.game_bet_value,
                        startTime: ticketInfo.data.startTime
                    }
                }
                ]
            })

            return response.transactionId;
        } else {
            return "NO DATA, NOT RUN."
        }
    } catch(err) {
        console.error(err.message);
        return 'error';
    }
}

function exportCSV() {
    let path = `${__dirname}/../resubmit-report.csv`;
    const records = resubmitInfo;
    const csvWriter = createCsvWriter({
      path,
      header: [
        { id: 'ticketId', title: 'ticket id' },
        { id: 'userId', title: 'user id' },
        { id: 'amount', title: 'amount' },
        { id: 'action', title: 'action' },
        { id: 'resubmit', title: 'resubmit' },

      ],
    });
    csvWriter.writeRecords(records);
    console.log(`======> path: ${path} <===========`)
    console.log('=====>>>>> Done report <<<<<=====');
}