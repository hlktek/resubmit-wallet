require('dotenv').config();
const config = require('./config');

const fs = require('fs');
const readline = require('readline');
const axios = require('axios').default;
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
            const callGamemsResult = await callGames(ticketInfo);
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

async function callGames(requests) {
    try {
        const response = await axios({
            url : `${config.GAMES_URL}/gamems/v1/agency/transfer`,
            method : 'post',
            data : requests
        })
        if (response.status === 200 && response.data && response.data.data && response.data.data.length > 0){ 
            return response.data.data[0].error_code;
        } else {
            return null;
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