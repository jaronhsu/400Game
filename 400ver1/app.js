var express = require('express');
var app = express();

var server = require('http').createServer(app);

app.get('/',function(req, res) {
	res.sendFile(__dirname + '/client/index.html');
});
app.use('/client',express.static(__dirname + '/client'));


console.log("Server started.");

SOCKET_LIST = {};
var players = {};
var hands = [];
var locked_in_players = [];
var n_players = 0;
var n_new_players = 0;
var player_turn_id = 0;
var dealer_id = 0;
var round_start = false;
var cards_dealt = false;
var first_card_in_round = false;
var waitTimer = true;
var gameEnd = false;
var calls_submitted = 0;
var cards_submitted = 0;
var hands_played = 0;
var hand_suit = -1;
var winner = -1;

function cardCompare(a, b) { // false for a < b, true for a > b
    if (a.Suit * 13 + a.Value < b.Suit * 13 + b.Value) {
        return false;
    }
    else {
        return true;
    }
}

function merge(left, right) {
    var left_i = 0;
    var right_i = 0;
    var output = [];

    while (left_i < left.length && right_i < right.length) {
        if (cardCompare(left[left_i], right[right_i])) {
            output.push(left[left_i]);
            left_i++;
        }
        else {
            output.push(right[right_i]);
            right_i++;
        }
    }
    return output.concat(left.slice(left_i)).concat(right.slice(right_i));
}

function merge_sort(input_array) {
    if (input_array.length < 2) { //possibly add n = 0 check;
        return input_array;
    }
    var mid = Math.floor(input_array.length / 2);
    var left = input_array.slice(0, mid);
    var right = input_array.slice(mid);

    return merge(merge_sort(left), merge_sort(right));
}

function win_determinator(startingPlayerId) {
    currBestCard = players[startingPlayerId].move;
    currWinner = startingPlayerId;
    for (i = 0; i < 4; i++) {
        console.log("winning player atm: " + currWinner + ", i is: " + i + "best card is currently: ");
        console.log(currBestCard);
        if (currBestCard.Suit < players[i].move.Suit && players[i].move.Suit == 3) {
            currBestCard = players[i].move;
            currWinner = i;
        }
        else if (currBestCard.Suit == players[i].move.Suit) {
            if (currBestCard.Value < players[i].move.Value) {
                currBestCard = players[i].move;
                currWinner = i;
            }
        }
    }
    players[currWinner].round_score++;
    for(var i in SOCKET_LIST){
        SOCKET_LIST[i].emit('winnerDeclared', currWinner, players[i].round_score, players);
    }
    return parseInt(currWinner);

}

function valid_card_check(attempted_card, attempter) {
    if (attempted_card.Used) {
        return false;
    }
    else if (attempted_card.Suit == hand_suit) {
        return true;
    }
    else {
        for (i = 0; i < 13; i++) {
            if (hands[attempter][i].Suit == hand_suit && !hands[attempter][i].Used) {
                return false;
            }
        }
        return true;
    }
}

var io = require('socket.io')(server);
io.sockets.on('connection', function(socket){
    // console.log(socket);
    // var address = socket.request.connection.remoteAddress;
    // console.log('New connection from ' + address);
    n_players++;
    var playerId = n_new_players;
    n_new_players++;
    console.log("n_players = " + n_players);
    //console.log('new player id is : ' + playerId);
    SOCKET_LIST[playerId] = socket;
    players[playerId] = {call:0, round_score:0, move:null, game_score:0, allowed_reshuffle:false};
    socket.emit('setPlayerId', playerId);
    
    socket.on('sendMsgToServer',function(data){
        // console.log('someone sent a message!');
        // console.log(data[1]);

        if (data.slice(0, 13) == "playerNumber=" && SOCKET_LIST[parseInt(data.slice(13))] == null) {
            delete SOCKET_LIST[playerId];
            playerId = parseInt(data.slice(13));
            console.log("playerNumber " + playerId + " has been reassigned");
            SOCKET_LIST[playerId] = socket;
            socket.emit("playerNumberReassign", players, hands[playerId], round_start, playerId);
            socket.emit("addToChat", "You are now Player " + playerId, playerId);
            for(var i in SOCKET_LIST){
                SOCKET_LIST[i].emit('addToChat', "Player " + playerId + " has reconnected", playerId);
            }
        }
        else {
            for(var i in SOCKET_LIST){
                SOCKET_LIST[i].emit('addToChat', data, playerId);
            }
        }
    });

    socket.on('disconnect',function(){
        delete SOCKET_LIST[playerId];
        for(var i in SOCKET_LIST){
            SOCKET_LIST[i].emit('addToChat', "Player " + playerId + " has disconnected", playerId);
        }
        n_players--;
        console.log("(disconnect) n_players = " + n_players);
    });
    
    socket.on('roundStart', function(){ //rounds being played out
        // console.clear();
        // console.log("person that hit start is : " + playerId);
        
        if (4 == n_players && !round_start && !cards_dealt && !gameEnd) {
            cards_dealt = true;
            player_turn_id = (dealer_id + 3) % 4;
            winner = player_turn_id;
            dealer_id = (dealer_id + 1) % 4;
            hands_played = 0;
            // ------------------------------------------------------------------------------------------------------------------------------------------------------- Deck and hand distribution
            var deck = [];
            hands = [];
            locked_in_players = [];
            // used_cards = [];
            const suits = [0, 1, 2, 3]; // 'C', 'D', 'S', 'H'
            const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]; //  "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"
    
            for (let i = 0; i < suits.length; i++) { // create
                for (let j = 0; j < values.length; j++) {
                    let card = {Value: values[j], Suit: suits[i], Used: false};
                    deck.push(card);
                }
            }
        
            for (let i = deck.length - 1; i > 0; i--) { // shuffle
                let x = Math.floor(Math.random() * i);
                let temp = deck[i];
                deck[i] = deck[x];
                deck[x] = temp;
            }
    
            
            for (i = 0; i < 4; i++) {
                if (players[i].game_score >= 40) {
                    players[i].call = 4;
                }
                else if (players[i].game_score >= 31) {
                    players[i].call = 3;
                }
                else {
                    players[i].call = 2;
                }
                players[i].round_score = 0;
            }

            var deal_counter = 0;
            for(var i in SOCKET_LIST){
                if (players[i].game_score >= 40) {
                    players[i].call = 4;
                }
                else if (players[i].game_score >= 31) {
                    players[i].call = 3;
                }
                else {
                    players[i].call = 2;
                }
                players[i].round_score = 0;

                var temp = merge_sort(deck.slice(0 + deal_counter, 13 + deal_counter));
                hands.push(temp);
                SOCKET_LIST[i].emit('dealCards', temp, players);
                players[i].allowed_reshuffle = false;
                // players[i].call = 0;
                players[i].move = null;
    
                if (hands[i][0].Suit != 3) {
                    SOCKET_LIST[i].emit('reshuffleEnable', true);
                    players[i].allowed_reshuffle = true;
                    // console.log("no hearts in hand ----------------------------------------------------------");
                }
    
                deal_counter += 13;
            }
        }
    });

    socket.on('lockIn', function(data, data2) {
        if (round_start == false && data > players[playerId].call && data2 && !first_card_in_round && !gameEnd) {
            players[playerId].call = data;
            for(var i in SOCKET_LIST){
                SOCKET_LIST[i].emit('playerLockedIn', players);
            }
        }
        var sum = 0;
        for (i = 0; i < 4; i++) {
            sum += players[i].call;
        }
        if (data2 == true && !gameEnd) {
            locked_in_players[playerId] = true;
        }
        else if (data2 == false) {
            locked_in_players[playerId] = false;
        }
        calls_submitted = 0;
        for (i = 0; i < 4; i++) {
            if (locked_in_players[i] == true) {
                calls_submitted++;
            }
        }

        if (calls_submitted == 4 && sum >= 11 && !gameEnd) { // implement message that goes out to table message when all 4 have locked in, but not over 11, at which point reshuffle activates for everyone,
            // otherwise, reshuffle only activates if u have 0 hearts
            console.log("calls acquired, starting play");
            for(var i in SOCKET_LIST){
                SOCKET_LIST[i].emit('reshuffleEnable', false);
                SOCKET_LIST[i].emit('playerTurnChanged', player_turn_id);
            }
            round_start = true;
        }

        if (calls_submitted == 4 && sum < 11 && !gameEnd) {
            console.log("calls acquired, sum too small");
            for(var i in SOCKET_LIST){
                players[i].allowed_reshuffle = true;
                SOCKET_LIST[i].emit('reshuffleEnable', true);
            }
        }


    });

    socket.on('force_reshuffle',function(){
        // console.log("force reshuffle used by player : " + playerId);
        if (players[playerId].allowed_reshuffle && !gameEnd && !first_card_in_round) {
            console.log("permission granted force reshuffle used by player : " + playerId);
            for(var i in SOCKET_LIST){
                SOCKET_LIST[i].emit('reshuffleUsed', playerId);
            }

            if (n_players > 4) {
                console.log("TOO MANY PLAYERS DETECTED");
            }
            
            player_turn_id = (dealer_id + 3) % 4;
            winner = player_turn_id;
            dealer_id = (dealer_id + 1) % 4;
            hands_played = 0;
            // ------------------------------------------------------------------------------------------------------------------------------------------------------- Deck and hand distribution
            var deck = [];
            hands = [];
            locked_in_players = [];
            const suits = [0, 1, 2, 3]; // 'C', 'D', 'S', 'H'
            const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]; //  "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"
    
            for (let i = 0; i < suits.length; i++) { // create
                for (let j = 0; j < values.length; j++) {
                    let card = {Value: values[j], Suit: suits[i], Used: false};
                    deck.push(card);
                }
            }
        
            for (let i = deck.length - 1; i > 0; i--) { // shuffle
                let x = Math.floor(Math.random() * i);
                let temp = deck[i];
                deck[i] = deck[x];
                deck[x] = temp;
            }
    
            var deal_counter = 0;

            for (i = 0; i < 4; i++) {
                if (players[i].game_score >= 40) {
                    players[i].call = 4;
                }
                else if (players[i].game_score >= 31) {
                    players[i].call = 3;
                }
                else {
                    players[i].call = 2;
                }
                players[i].round_score = 0;
            }

            for(var i in SOCKET_LIST){
                var temp = merge_sort(deck.slice(0 + deal_counter, 13 + deal_counter));
                hands.push(temp);
                SOCKET_LIST[i].emit('dealCards', temp, players);
                players[i].allowed_reshuffle = false;
                // players[i].call = 0;
                players[i].move = null;
    
                if (hands[i][0].Suit != 3) {
                    SOCKET_LIST[i].emit('reshuffleEnable', true);
                    players[i].allowed_reshuffle = true;
                }
    
                deal_counter += 13;
            }
        }
    });

    socket.on('cardSubmit',function(data){
        if (cards_submitted == 0 && round_start && waitTimer && !gameEnd) {
            first_card_in_round = true;
            hand_suit = hands[playerId][data].Suit;
        }
        if (round_start && playerId == player_turn_id && valid_card_check(hands[playerId][data], playerId) && waitTimer && !gameEnd) {
            for(var i in SOCKET_LIST){
                SOCKET_LIST[i].emit('cardPlayed', playerId, hands[playerId][data]);
            }
            players[playerId].move = hands[playerId][data];
            cards_submitted++;
            hands[playerId][data].Used = true;
            
            // used_cards.push(hands[playerId][data].Suit * 13 + hands[playerId][data].Value)
            console.log("player "+ playerId + " chose " + hands[playerId][data].Value + " " + hands[playerId][data].Suit );
            player_turn_id = (parseInt(player_turn_id) + parseInt(3)) % parseInt(4);
            // console.log("It is now Player" + player_turn_id + "'s turn");
            for(var i in SOCKET_LIST){
                SOCKET_LIST[i].emit('playerTurnChanged', player_turn_id);
            }
            socket.emit('valid_test', 1, data);
        }
        else {
            socket.emit('valid_test', 0, data);
        }
        if(cards_submitted == 4 && !gameEnd){
            winner = win_determinator(winner);
            player_turn_id = winner;
            console.log(winner + " wins!");
            console.log("-----------------------------------------------------------------");
            waitTimer = false;
            cards_submitted = 0;
            hands_played++;
            setTimeout(() => { 
                waitTimer = true;
                if (hands_played < 13) {
                    for(var i in SOCKET_LIST) {
                        SOCKET_LIST[i].emit('playerTurnChanged', player_turn_id);
                    }
                }
            }, 5010);
        }

        if (hands_played == 13 && !gameEnd) {
            round_start = false;
            cards_dealt = false;
            first_card_in_round = false;
            calls_submitted = 0;
            for (i = 0; i < 4; i++) {
                if (players[i].round_score < players[i].call) {
                    if (players[i].call < 5) {
                        players[i].game_score -= players[i].call;
                    }
                    else if (players[i].call < 9) {
                        players[i].game_score -= players[i].call * 2;
                    }
                    else if (players[i].call < 13) {
                        players[i].game_score -= players[i].call * 3;
                    }
                    else {
                        console.log("big sad");
                        players[i].game_score -= players[i].call * 4;
                    }
                }
                else {
                    if (players[i].call < 5) {
                        players[i].game_score += players[i].call;
                    }
                    else if (players[i].call < 9) {
                        players[i].game_score += players[i].call * 2;
                    }
                    else if (players[i].call < 13) {
                        players[i].game_score += players[i].call * 3;
                    }
                    else {
                        console.log("instant win yay");
                        players[i].game_score += players[i].call * 400;
                    }
                }

                if (players[i].game_score >= 40) {
                    players[i].call = 4;
                }
                else if (players[i].game_score >= 31) {
                    players[i].call = 3;
                }
                else {
                    players[i].call = 2;
                }
                players[i].round_score = 0;
            }

            
            for (j = 0; j < 4; j++) {
                if ((players[j].game_score >= 41 && players[(j + 2) % 4].game_score >= 0) && !(players[(j + 1) % 4].game_score >= 41 && players[(j + 3) % 4].game_score >= 0) && !gameEnd) {
                    gameEnd = true;
                    for(i = 0; i < 4; i++){
                        SOCKET_LIST[i].emit('gameEnd', parseInt(j), (parseInt(j) + 2) % 4, players);
                    }
                }
            }

            if (!gameEnd) {
                for(var i in SOCKET_LIST){
                    SOCKET_LIST[i].emit('roundEnd', players);
                }
            }
        }
    });
});

server.listen(4141);