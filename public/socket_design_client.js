"use strict"
console.log('socket_design_client.js loaded')

// const mad_client = require("./mad_client");

let active_room_id = '-1';
let active_game_id = '-2';
let last_clicked_lobby_room_id = -1;

let game_data; // info that persists for one game
let game_state_data; // info that persists for one turn

let socket_local = io();

let audio = new Audio('/audio/track_01.mp3');

socket_local.on('mad_log', function(msg) {
    console.log('From server: ' + msg);
    document.getElementById('socket_log').innerHTML = document.getElementById('socket_log').innerHTML + '<br>' + msg 
});

socket_local.on('tick', function(msg) {
    console.log('tick')
    console.log(msg)
} );

socket_local.on('client_joined_room', function(room_id) {
    console.log('client_joined_room')
    active_room_id = room_id;

    document.getElementById('waiting_room_id').innerHTML = `Room: ${room_id}`
    
    // Number of players in room
    // Number of players ready
    // Who host is
    // Table w/ list of players and their colors and their ready status, and a star next to the host
    // Table w/ list of bots? or just a dropdown or slider or to select number of bots?
    // Game input controls - visible to all players, only editable by host, with shuffle button to randomize



    switch_to_waiting_room_gui()

});

socket_local.on('client_created_room', function(room_id, user_nick) {
    console.log('client_created_room')
    active_room_id = room_id;
    document.getElementById('waiting_room_id').innerHTML = `Room: ${room_id}`

    // let tbl = document.getElementById('table-players-in-room');
    // let tbl_row = document.createElement('tr');
    // tbl_row.id = `tbl_row_${user_nick}`;
    // tbl_row.innerHTML = `<td>${user_nick}</td><td>*</td><td>Ready</td>`;
    // tbl.appendChild(tbl_row);
    
    switch_to_waiting_room_gui()
});

socket_local.on('a_user_joined_the_room', function(user_id) {
    console.log('a_user_joined_the_room', user_id)
    document.getElementById('socket_log').innerHTML = document.getElementById('socket_log').innerHTML + '<br>' + user_id + ' joined the room';

    // //update the table of players in the room
    // let tbl = document.getElementById('table-players-in-room');
    // let tbl_row = document.createElement('tr');
    // tbl_row.id = `tbl_row_${user_id}`;
    // tbl_row.innerHTML = `<td>${user_id}</td><td></td><td>Ready</td>`;
    // tbl.appendChild(tbl_row);
    
});

socket_local.on('a_user_left_the_room', function(user_id) {
    console.log('a_user_left_the_room', user_id)
    document.getElementById('socket_log').innerHTML = document.getElementById('socket_log').innerHTML + '<br>' + user_id + ' left the room';

    //update the table of players in the room
    let tbl = document.getElementById('table-players-in-room');
    let tbl_row = document.getElementById(`tbl_row_${user_id}`);
    tbl.removeChild(tbl_row);

});


socket_local.on('lobby_info', function(list_rooms, players_in_lobby, players_online) {
    document.getElementById('players_online').innerHTML = `Players Online: ${players_online}`
    
    // console.log(`players in lobby: ${players_in_lobby}`)
    let lobby_table = document.getElementById('table-lobby');

    // var myTable = document.getElementById('myTable');
    // myTable.rows[0].cells[1].innerHTML = 'Hello';
    const num_rows_in_tbl = 10; // TODO this is 1 constant stored in 2 places - unify them!
    let num_rooms_to_display = Math.min(num_rows_in_tbl, list_rooms.length)
    let bg_color;
    const N_COLS = 5; //TODO magic number in 2 places again

    for (let i = 0; i < num_rooms_to_display; i++) {
        // console.log('add row for room ', i)
        
        bg_color = (list_rooms[i]['room_id'] == last_clicked_lobby_room_id) ? '#FFBBBB' : '#EEEEEE';
        for(let col=0; col < N_COLS; col++) {
            //tbl_row.cells[i].style.backgroundColor = '#FFBBBB' //todo only highlight this cell
            lobby_table.rows[i+1].cells[col].style.backgroundColor = bg_color;
        }        
        lobby_table.rows[i+1].style.cursor = 'pointer';
    
        lobby_table.rows[i+1].cells[0].innerHTML = list_rooms[i]['room_id']; //row i+1 because of the the header row
        lobby_table.rows[i+1].cells[1].innerHTML = list_rooms[i]['game_mode'];
        lobby_table.rows[i+1].cells[2].innerHTML = list_rooms[i]['players'];
        lobby_table.rows[i+1].cells[3].innerHTML = list_rooms[i]['bots'];
        lobby_table.rows[i+1].cells[4].innerHTML = list_rooms[i]['status'];       
    }
    
    for (let i = num_rooms_to_display; i < num_rows_in_tbl; i++) {
        bg_color = '#BBBBBB'
        for(let col=0; col < N_COLS; col++) {
            //tbl_row.cells[i].style.backgroundColor = '#FFBBBB' //todo only highlight this cell
            lobby_table.rows[i+1].cells[col].style.backgroundColor = bg_color;
        }
        lobby_table.rows[i+1].style.cursor = 'default';

        lobby_table.rows[i+1].cells[0].innerHTML = '-';
        lobby_table.rows[i+1].cells[1].innerHTML = '-';
        lobby_table.rows[i+1].cells[2].innerHTML = '-';
        lobby_table.rows[i+1].cells[3].innerHTML = '-';
        lobby_table.rows[i+1].cells[4].innerHTML = '-';

    }

})

socket_local.on('new_game_from_server', function(game_data_string) {
    new_game_client(game_data_string); //LEFT HERE 6/5
    switch_to_game_gui();

})

socket_local.on('client_receives_game_state', function(game_state_string){
    // console.log('WOOOOOOOO');
    // console.log(game_state_string);
    client_receives_game_state_here(game_state_string);
});

socket_local.on('receive_updated_room_settings', function(game_data_json){
    // console.log('HERE I RECEIVE!');
    let game_data = JSON.parse(game_data_json);
    // console.log(game_data);
    document.getElementById('rows_range').value = game_data.n_rows;
    document.getElementById('cols_range').value = game_data.n_cols;
    document.getElementById('bots_range').value = game_data.n_bots;
    document.getElementById('mountains_range').value = game_data.mountain_weight;
    document.getElementById('ships_range').value = game_data.ship_weight;
    document.getElementById('swamps_range').value = game_data.swamp_weight;
    document.getElementById('radio_fog_on').checked = game_data.fog_of_war;
    document.getElementById('radio_fog_off').checked = !game_data.fog_of_war;

    document.getElementById('rows_label').innerHTML = game_data.n_rows;
    document.getElementById('cols_label').innerHTML = game_data.n_cols;
    document.getElementById('bots_label').innerHTML = game_data.n_bots;
    document.getElementById('mountains_label').innerHTML = game_data.mountain_weight;
    document.getElementById('ships_label').innerHTML = game_data.ship_weight;
    document.getElementById('swamps_label').innerHTML = game_data.swamp_weight;

});

socket_local.on('update_player_list', function(connected_sockets) {
    console.log(connected_sockets)
    let tbl = document.getElementById('table-players-in-room');


    // let currently_connected_sockets = io.sockets.adapter.rooms.get(room.room_id);
    for(let r = 0; r < 10; r++) { //janky magic number - 10 rows in the table of players in the room for now.. TODO
        let tbl_row = document.getElementById(`tbl_players_row_${r}`);
        tbl_row.innerHTML = `<td>-</td><td>-</td><td>-</td>`;
    }
    let i = 0;
    connected_sockets.forEach(nickname => {
        let ready = 'Ready'; //TODO
        let host = i==0 ? '*' : ''; //player who has been here longest is host. for now.

        let tbl_row = document.getElementById(`tbl_players_row_${i}`);
        tbl_row.innerHTML = `<td>${nickname}</td><td>${host}</td><td>${ready}</td>`;
        i++;
    });
    

});

// let player_socket_ids = io.sockets.adapter.rooms.get(room_id);
// add_humans(player_socket_ids, human_colors) {
//     let i = 0;
//     player_socket_ids.forEach(socket_id => {
//         let sock = io.sockets.sockets.get(socket_id);
//         let nickname = sock.nickname;
//         this.add_human(socket_id, nickname, human_colors[i]);
//         i++;
//     });
// }

function client_receives_game_state_here(game_state_string) {
    // console.log(game_state_string)
    game_state_data = JSON.parse(game_state_string);
    // console.log(game_state_data)

    if (cells_client.length > 0) {    
        //console.log('Attempting a new way of rendering')
        
        game_tick_local = game_state_data.game.turn // update the turn count
        // Update the board to contain only info the player should currently be able to see
        cells_client.forEach(cell => {
            cell.owner = null;
            cell.troops = 0;
            cell.entity = null;
            cell.terrain = null;
            cell.visible = false;
        });
                
        game_state_data.board.forEach(new_cell => {
            if('owner' in new_cell) { cells_client[new_cell.id].owner = new_cell.owner };
            if('troops' in new_cell) { cells_client[new_cell.id].troops = new_cell.troops };
            if('entity' in new_cell) { cells_client[new_cell.id].entity = new_cell.entity };
            if('terrain' in new_cell) { cells_client[new_cell.id].terrain = new_cell.terrain };
            if('visible' in new_cell) { cells_client[new_cell.id].visible = new_cell.visible };
        });

        let scoreboard_data = game_state_data.scoreboard;
        scoreboard_data.sort((a, b) => (a.troops > b.troops) ? -1 : 1); //sort by troops, descending
        
        const table_body = scoreboard_data.map(value => {
            let bg_color = value.admirals == 0 ? CellClient.neutral_entity_color : value.color; // remove the player's fleet color from the scoreboard if they're out of the game
            return (
                `<tr bgcolor="${bg_color}">
                <td style="color:#FFFFFF;text-align:center">${value.display_name}</td>
                <td style="color:#FFFFFF;text-align:center">${value.admirals}</td>
                <td style="color:#FFFFFF;text-align:center">${value.ships}</td>
                <td style="color:#FFFFFF;text-align:center">${value.troops}</td>
                </tr>`
            );
        }).join('');
        document.getElementById('scoreboard_body').innerHTML = table_body;
    
    } else {console.log('Not ready yet!')}

    
    // Update the local move queue - if one or more moves has been removed by the server, remove them from the front of the local queue
    let new_min_queue_id = game_state_data.game.next_queue_id

    if (new_min_queue_id == '-1') {
        //console.log('got here')
        local_move_queue.length = 0;
    } else {
        let not_caught_up = true;
        while (local_move_queue.length>0 && not_caught_up) {
            if (local_move_queue[0].id < new_min_queue_id) {
                local_move_queue.shift();
            } else { not_caught_up = false; } //escape 
        };
    }


    render_board(); // display the updated board
    
}


function new_game_client(game_data_string) {
    
    game_data = JSON.parse(game_data_string); //set global variable 
    console.log('new game_data ')
    console.log(game_data)
    active_game_id = game_data.game.game_id;
    //call this after a new game has been created at the server level
    let canvas = document.getElementById('canvas');
    canvas.height = CellClient.height*game_data.game.n_rows // canvas width must match cols*col_size
    canvas.width = CellClient.width*game_data.game.n_cols // canvas width must match cols*col_size
    create_client_cells(game_data.game.n_rows, game_data.game.n_cols); // Create an array of Cells objects, each representing one cell in the simulation
    move_mode = ACTION_MOVE_NORMAL;
    render_board(); // display the starting conditions for the sim

    // Start playing background music
    audio.loop = true;
    audio.play();
}


function switch_to_login_gui() {
    document.getElementById('mad-login-div').style.display = 'block';
    document.getElementById('mad-lobby-div').style.display = 'none';
    document.getElementById('mad-waiting-room-div').style.display = 'none';
    document.getElementById('mad-game-div').style.display = 'none';
    document.getElementById('mad-news-div').style.display = 'none';
    document.getElementById('mad-scoreboard-div').style.display = 'none';
}

function switch_to_waiting_room_gui() {
    enable_controls_iff_room_host(); // enable/disable controls based on whether the player is the host of the room

    document.getElementById('mad-login-div').style.display = 'none';
    document.getElementById('mad-lobby-div').style.display = 'none';
    document.getElementById('mad-waiting-room-div').style.display = 'block';
    document.getElementById('mad-game-div').style.display = 'none';
    document.getElementById('mad-news-div').style.display = 'block';
    document.getElementById('mad-scoreboard-div').style.display = 'none';
    // reset_chat_log();
}

function switch_to_lobby_gui() {
    document.getElementById('mad-login-div').style.display = 'none';
    document.getElementById('mad-lobby-div').style.display = 'block';
    document.getElementById('mad-waiting-room-div').style.display = 'none';
    document.getElementById('mad-game-div').style.display = 'none';
    document.getElementById('mad-news-div').style.display = 'block';
    document.getElementById('mad-scoreboard-div').style.display = 'none';
    // reset_chat_log();
    active_room_id = 'lobby';
}

function switch_to_game_gui() {
    document.getElementById('mad-login-div').style.display = 'none';
    document.getElementById('mad-lobby-div').style.display = 'none';
    document.getElementById('mad-waiting-room-div').style.display = 'none';
    document.getElementById('mad-game-div').style.display = 'block';
    document.getElementById('mad-news-div').style.display = 'none';
    document.getElementById('mad-scoreboard-div').style.display = 'block';

    reset_chat_log();
}

function reset_chat_log() {
    document.getElementById('socket_log').innerHTML = '';
}

function send_chat_message(room, msg) {
    if (msg.length > 0)  {
        socket_local.emit('send_chat_message', room, msg);
    }
}

socket_local.on('receive_chat_message', function(msg) {
    //console.log('receive_chat_message', sender_id, msg)
    document.getElementById('socket_log').innerHTML = document.getElementById('socket_log').innerHTML + '<br>' + msg
    // document.getElementById('socket_log').scrollTo(0, document.getElementById('socket_log').innerHeight);

    document.getElementById('mad-chat-inner-div').scrollTop = document.getElementById('mad-chat-inner-div').scrollHeight;

});
    

    // emit('receive_chat_message', socket.id, msg)



// function generateTableHead(table, data) {
//     let thead = table.createTHead();
//     let row = thead.insertRow();
//     for (let key of data) {
//       let th = document.createElement("th");
//       let text = document.createTextNode(key);
//       th.appendChild(text);
//       row.appendChild(th);
//     }
//   }

function enable_controls_iff_room_host() {
    // Enable/disable controls based on whether the player is the host of the room
    console.log('enable_controls_iff_room_host')
}
function get_selected_room() {
    //placeholder logic:
    let selected_room_id = last_clicked_lobby_room_id;

    return selected_room_id;
}


function populate_gui() {  
    function get_login_div() {
        let div = document.createElement('div');
        div.id = 'mad-login-div';

        let login_form = document.createElement('form');
        login_form.id = 'login_form';
        div.appendChild(login_form);

        let lbl_input = document.createElement('label');
        lbl_input.htmlFor = 'input_name';
        lbl_input.innerText = 'Your Name';
        let input_name = document.createElement('input');
        input_name.id = 'input_name';
        input_name.type = 'text';
        input_name.value='Player One';
        
        let login_button = document.createElement('button');
        login_button.innerText = 'Set Name';
    
        login_form.appendChild(lbl_input);
        // login_form.appendChild(document.createElement('br'));
        login_form.appendChild(input_name);
        login_form.appendChild(login_button);

        login_form.addEventListener('submit', function handleSubmit(event) {
            event.preventDefault();

            let new_name = input_name.value;
            if(new_name.length > 0) {
                let old_name = localStorage.getItem('nickname');

                if (old_name != null) {
                    if (new_name != old_name) {
                        socket_local.emit('change_nickname', old_name, new_name)
                    }
                }
                else {
                    socket_local.emit('login_with_name', new_name)
                }

                let p_name = document.getElementById('player_name');
                p_name.innerHTML = `Playing as ${new_name}`
                switch_to_lobby_gui();
            
                localStorage.setItem('nickname', new_name);

            };
        });

        return div;
    }

    function get_news_div() {
        let div = document.createElement('div');
        div.id = 'mad-news-div';

        let p_name = document.createElement('p')
        p_name.innerHTML = '' // once logged in the user's name will appear here
        p_name.id = 'player_name';
        
        let change_name = document.createElement('button');
        change_name.innerText = 'Set Name';
        change_name.addEventListener('click', function(){
            console.log('set name');
            switch_to_login_gui();
        });

        let p_news = document.createElement('p')
        p_news.innerHTML = 'News Feed'

        let p_players = document.createElement('p')
        p_players.innerHTML = 'Players Online: 0'
        p_players.id = 'players_online'

        let btn_how_to_play = document.createElement('button');
        btn_how_to_play.innerText = 'How to Play';
        btn_how_to_play.addEventListener('click', function(){
            console.log('how to play');
        });

        div.appendChild(p_name);
        div.appendChild(change_name);
        div.appendChild(p_players);
        div.appendChild(p_news);
        div.appendChild(btn_how_to_play);

        

        return div;
    }
    function get_lobby_div() {
        let div = document.createElement('div');
        div.id = 'mad-lobby-div'
    
        let tbl_lobby = document.createElement('table')
        tbl_lobby.id = 'table-lobby';
        div.appendChild(tbl_lobby)
        
        // Create table header row
        let tbl_tr = document.createElement('tr');
        let keys = ['id', 'Game Mode', 'Players', 'Bots', 'Status']
        for (let key of keys) {
            let tabl_th = document.createElement('th');
            tabl_th.textContent = key;
            tbl_tr.appendChild(tabl_th);
        }
        tbl_lobby.appendChild(tbl_tr);
        
        //Create placeholder table rows
        const n_rows = 10; // number of placeholder table rows to include TODO constant defined in 2 places, unify them
        const n_cols = keys.length;
        for(let r = 0; r < n_rows; r++) {
            let tbl_row = document.createElement('tr');
            tbl_row.id = `tbl_row_${r}`;
            
            tbl_row.addEventListener('click', function(){
                // console.log('test click on a row', tbl_row.id, r)
                if (tbl_row.cells[0].innerHTML != '-') {
                    last_clicked_lobby_room_id = tbl_row.cells[0].innerHTML;
                    
                    for(let i=0; i<n_cols; i++) {
                        tbl_row.cells[i].style.backgroundColor = '#FFBBBB'
                    }   
                }
            });
            tbl_row.addEventListener('dblclick', function(){
                // console.log('test DOUBLE click on a row', tbl_row.id, r)
                if (tbl_row.cells[0].innerHTML != '-') {
                    last_clicked_lobby_room_id = tbl_row.cells[0].innerHTML;
                    
                    for(let i=0; i<n_cols; i++) {
                        tbl_row.cells[i].style.backgroundColor = '#FFBBBB'
                    }   
                    socket_local.emit('join_game_room', last_clicked_lobby_room_id)
                }
            });            

            for (const key of keys) {
                const tbl_cell = document.createElement('td');
                tbl_cell.textContent = '-';
                tbl_row.appendChild(tbl_cell);
              }

            tbl_lobby.appendChild(tbl_row);
        }        

        let btn_create = document.createElement('button');
        btn_create.innerText = 'Create New Room';
        btn_create.addEventListener('click', function(){
            socket_local.emit('create_room')
        });
        div.appendChild(btn_create);
        
        let btn_join_room = document.createElement('button');
        btn_join_room.innerText = 'Join Room';
        btn_join_room.addEventListener('click', function(){
            let room_to_join = get_selected_room(); // TODO TEMP until we add a table listing open rooms
            socket_local.emit('join_game_room', room_to_join)
        });
        div.appendChild(btn_join_room);
        
        return div;
    }

    function get_waiting_room_div() {
        let div = document.createElement('div');
        div.id = 'mad-waiting-room-div'

        let game_settings_left = document.createElement('div');
        game_settings_left.classList.add('mad-game-settings-inner');
        div.appendChild(game_settings_left)
        
        let game_settings_mid = document.createElement('div');
        game_settings_mid.classList.add('mad-game-settings-inner');
        div.appendChild(game_settings_mid)
        
        let game_settings_right = document.createElement('div');
        game_settings_right.classList.add('mad-game-settings-inner');
        div.appendChild(game_settings_right)
        
        // Initial values for the game board size - make sure the suggested map size is wider than tall
        let width_or_height_a = Math.floor(Math.random() * 15) + 15 //make sure suggested map size is wider than tall
        let width_or_height_b = Math.floor(Math.random() * 10) + 10
        
        game_settings_left.appendChild(create_player_list_table());

        //for each numeric game setting, create and append a slider with label and randomized starting value 
        add_slider(game_settings_mid, 'bots', 'Bots', 0, 10, 1, Math.floor(Math.random() * 4) + 1);
        add_slider(game_settings_mid, 'cols', 'Mad Width', 10, 45, 1, Math.max(width_or_height_a, width_or_height_b));
        add_slider(game_settings_mid, 'rows', 'Map Height', 10, 30, 1, Math.min(width_or_height_a, width_or_height_b));
        add_slider(game_settings_right, 'mountains', 'Mountain Spawn Rate', 1, 100, 1, 15);
        add_slider(game_settings_right, 'ships', 'Ship Spawn Rate', 1, 100, 1, 5);
        add_slider(game_settings_right, 'swamps', 'Swamp Spawn rate', 1, 100, 1, 5);
        
        let lbl_fow = document.createElement('label')
        lbl_fow.innerHTML='Fog of War';
    
        let radio_fog_on = document.createElement('input');
        radio_fog_on.id = 'radio_fog_on';
        radio_fog_on.type = 'radio';
        radio_fog_on.name='Fog of War';
        radio_fog_on.value='On';
        radio_fog_on.checked= true;
        let lbl_fow_on = document.createElement('label')
        lbl_fow_on.innerHTML='On';
        
        let radio_fog_off = document.createElement('input');
        radio_fog_off.id = 'radio_fog_off';
        radio_fog_off.type = 'radio';
        radio_fog_off.name='Fog of War';
        radio_fog_off.value='Off';
        let lbl_fow_off = document.createElement('label')
        lbl_fow_off.innerHTML='Off';
        
        game_settings_mid.appendChild(lbl_fow);
        game_settings_mid.appendChild(document.createElement('br'));
        game_settings_mid.appendChild(radio_fog_on);
        game_settings_mid.appendChild(lbl_fow_on);
        game_settings_mid.appendChild(document.createElement('br'));
        game_settings_mid.appendChild(radio_fog_off);
        game_settings_mid.appendChild(lbl_fow_off);
        game_settings_mid.appendChild(document.createElement('br'));
        

        let lbl_spectate = document.createElement('label')
        lbl_spectate.innerHTML='Spectate on Defeat';
    
        let radio_spectate_on = document.createElement('input');
        radio_spectate_on.id = 'radio_spectate_on';
        radio_spectate_on.type = 'radio';
        radio_spectate_on.name='Spectate on Defeat';
        radio_spectate_on.value='On';
        radio_spectate_on.checked= true;
        let lbl_spectate_on = document.createElement('label')
        lbl_spectate_on.innerHTML='On';
        
        let radio_spectate_off = document.createElement('input');
        radio_spectate_off.id = 'radio_spectate_off';
        radio_spectate_off.type = 'radio';
        radio_spectate_off.name='Spectate on Defeat';
        radio_spectate_off.value='Off';
        let lbl_spectate_off = document.createElement('label')
        lbl_spectate_off.innerHTML='Off';
        
        game_settings_mid.appendChild(lbl_spectate);
        game_settings_mid.appendChild(document.createElement('br'));
        game_settings_mid.appendChild(radio_spectate_on);
        game_settings_mid.appendChild(lbl_spectate_on);
        game_settings_mid.appendChild(document.createElement('br'));
        game_settings_mid.appendChild(radio_spectate_off);
        game_settings_mid.appendChild(lbl_spectate_off);
        game_settings_mid.appendChild(document.createElement('br'));
        

        let lbl_show_all_admirals = document.createElement('label')
        lbl_show_all_admirals.innerHTML='Reveal All Admirals';
    
        let radio_show_all_admirals_on = document.createElement('input');
        radio_show_all_admirals_on.id = 'radio_show_all_admirals_on';
        radio_show_all_admirals_on.type = 'radio';
        radio_show_all_admirals_on.name='Reveal All Admirals';
        radio_show_all_admirals_on.value='On';
        let lbl_show_all_admirals_on = document.createElement('label')
        lbl_show_all_admirals_on.innerHTML='On';
        
        let radio_show_all_admirals_off = document.createElement('input');
        radio_show_all_admirals_off.id = 'radio_show_all_admirals_off';
        radio_show_all_admirals_off.type = 'radio';
        radio_show_all_admirals_off.name='Reveal All Admirals';
        radio_show_all_admirals_off.value='Off';
        radio_show_all_admirals_off.checked= true;        
        let lbl_show_all_admirals_off = document.createElement('label')
        lbl_show_all_admirals_off.innerHTML='Off';
        
        game_settings_mid.appendChild(lbl_show_all_admirals);
        game_settings_mid.appendChild(document.createElement('br'));
        game_settings_mid.appendChild(radio_show_all_admirals_on);
        game_settings_mid.appendChild(lbl_show_all_admirals_on);
        game_settings_mid.appendChild(document.createElement('br'));
        game_settings_mid.appendChild(radio_show_all_admirals_off);
        game_settings_mid.appendChild(lbl_show_all_admirals_off);
        game_settings_mid.appendChild(document.createElement('br'));
        // show_all_admirals

        let waiting_room_id = document.createElement('div');
        waiting_room_id.id = 'waiting_room_id'
        waiting_room_id.innerHTML = 'Room:';

        let btn_toggle_ready = document.createElement('button');
        btn_toggle_ready.innerText = 'Toggle Ready';
        btn_toggle_ready.addEventListener('click', function(){
            socket_local.emit('toggle_ready', active_room_id)
            send_waiting_room_game_settings(); //TEMP TEST
            let game_data_json = get_new_game_settings();
            socket_local.emit('send_updated_room_settings', active_room_id, game_data_json)            
        });        
        
        let btn_start_game = document.createElement('button');
        btn_start_game.innerText = 'Start Game';
        btn_start_game.addEventListener('click', function(){
            let game_data_json = get_new_game_settings();
            socket_local.emit('start_game', active_room_id, game_data_json)
        });
                
        let btn_leave_room = document.createElement('button');
        btn_leave_room.innerText = 'Leave Room';
        btn_leave_room.addEventListener('click', function(){
            socket_local.emit('leave_game_room', active_room_id)
            switch_to_lobby_gui();
        });        
        
        div.appendChild(waiting_room_id);
        div.appendChild(btn_toggle_ready);
        div.appendChild(btn_start_game);
        div.appendChild(btn_leave_room);
        
        return div;
    }
    function create_player_list_table() {
        let tbl_player_list = document.createElement('table')
        tbl_player_list.id = 'table-players-in-room';
        tbl_player_list.classList.add('table-players-in-room');
        
        // Create table header row
        let tbl_tr = document.createElement('tr');
        let keys = ['Name', 'Host', 'Status']
        for (let key of keys) {
            let tabl_th = document.createElement('th');
            tabl_th.textContent = key;
            tbl_tr.appendChild(tabl_th);
        }
        tbl_player_list.appendChild(tbl_tr);
        
        let n_rows = 10; //for max of 10 players.. this is janky. TODO
        for(let r = 0; r < n_rows; r++) {
            let tbl_row = document.createElement('tr');
            tbl_row.id = `tbl_players_row_${r}`
            tbl_player_list.appendChild(tbl_row)
        }
        

        return tbl_player_list;
    }

    function send_waiting_room_update(field_name, value) {
        let n = document.getElementById(field_name).value
        socket_local.emit('send_game_settings_preview', active_room_id, game_data_json)
    }

    function send_waiting_room_game_settings() {
    //call this from the host when the game settings are changed
        let game_data_json = get_new_game_settings(); 
        socket_local.emit('send_game_settings_preview', active_room_id, game_data_json)

    }

    function get_new_game_settings() {
        let game_data = {
            n_rows: document.getElementById('rows_range').value,
            n_cols: document.getElementById('cols_range').value,
            n_bots: document.getElementById('bots_range').value,
            fog_of_war: document.getElementById('radio_fog_on').checked,
            // player_name: document.getElementById('input_name').value,
            water_weight:100, // MAGIC NUMBER
            mountain_weight:Number(document.getElementById('mountains_range').value),
            ship_weight:Number(document.getElementById('ships_range').value),
            swamp_weight:Number(document.getElementById('swamps_range').value),
            spectate_on_defeat:document.getElementById('radio_spectate_on').checked,
            show_all_admirals:document.getElementById('radio_show_all_admirals_on').checked
        };
        
        return JSON.stringify(game_data)
    }
    
    function get_chat_div() {
        let div = document.createElement('div');
        div.id = 'mad-chat-div';

        let div_chat_messages = document.createElement('div');
        div_chat_messages.id = 'mad-chat-inner-div';
        div.appendChild(div_chat_messages);
        
        let p_chat = document.createElement('p')
        p_chat.id = 'socket_log'
        div_chat_messages.appendChild(p_chat);

        let input_chat = document.createElement('input')
        input_chat.id = 'input_chat'
        div.appendChild(input_chat);

        let btn_send_chat = document.createElement('button');
        btn_send_chat.innerText = 'Send Chat';
        btn_send_chat.addEventListener('click', function(){
            let msg = document.getElementById('input_chat').value;
            send_chat_message(active_room_id, msg);
            document.getElementById('input_chat').value = '';
        });

        input_chat.addEventListener('keypress', function(event) { //allow the user to use the enter key to send chat messages
            if (event.key === 'Enter') {
              event.preventDefault();
              btn_send_chat.click();
            }
          });


        div.appendChild(btn_send_chat);

        return div;
    }

    function get_scoreboard_div() {
        let div = document.createElement('div');
        div.id = 'mad-scoreboard-div';

        // turn_counter_scoreboard
        let div_turn_counter = document.createElement('div');
        div_turn_counter.id = 'turn-counter-scoreboard';
        div_turn_counter.innerHTML = 'Turn: 0';
        div.appendChild(div_turn_counter);

        // Add audio controls
        let music_toggle = document.createElement('button');
        music_toggle.innerText = 'Toggle Music';
        music_toggle.addEventListener('click', function(){
            if (audio.paused) {
                audio.play();
            } else {
                audio.pause();
            }
        });
        div.appendChild(music_toggle);
        
        let tbl = document.createElement('table')
        div.appendChild(tbl);
        let tbl_tr =  document.createElement('tr');

        // tbl_lobby.id = 'table-lobby';
        // div.appendChild(tbl_lobby)
        
        // // Create table header row
        // let tbl_tr = document.createElement('tr');
        let keys = ['Fleet', 'Admirals', 'Ships', 'Sailors']
        for (let key of keys) {
            let tbl_th = document.createElement('th');
            tbl_th.textContent = key;
            tbl_tr.appendChild(tbl_th);
        }
        tbl.appendChild(tbl_tr);

        let tbl_body = document.createElement('tbody');
        tbl_body.id = 'scoreboard_body';
        tbl.appendChild(tbl_body);


        return div;

    }

    function get_game_div() {
        let div = document.createElement('div');
        div.id = 'mad-game-div';

        let canvas = document.createElement('canvas');
        canvas.id = 'canvas';
        
        div.appendChild(canvas);
        
        canvas.width = 100;
        canvas.height = 100;
        canvas.style.border = '10px solid #0E306C'; //high tide color
        canvas.style.position = 'absolute'; 
        // canvas.style.zIndex = "2" //temp -- //"-1"; // set to a low z index to make overlapping elements cover the canvas
        
        // let context = canvas.getContext('2d');
    
        // canvas.addEventListener('mousedown', function (event) { canvas_mouse_handler(event) }, false); //our main click handler function
        canvas.addEventListener('contextmenu', function(event) { event.preventDefault(); }, false); // prevent right clicks from bringing up the context menu
        canvas.addEventListener('wheel', function (event) { wheel_handler(event) },  {passive: true}); // zoom in/out with the scroll wheel
        document.body.addEventListener('wheel', function (event) { wheel_handler(event) },  {passive: true}); // zoom in/out with the scroll wheel
        drag_canvas_event_handler(canvas); // custom function to handle dragging the canvas while the mouse is down
        
        // Add event listener on keydown
        document.addEventListener('keydown', (event) => {
            if (document.activeElement.id == 'input_chat' || document.activeElement.id == 'input_name') { //don't handle key presses if the user is typing in the chat box
                
            } else {
                //if (VALID_KEY_PRESSES.includes(event.key) && !new_game_overlay_visible) {
                if (VALID_KEY_PRESSES.includes(event.key)) {
                    event.preventDefault();
                    handle_key_press(event.key)
                }
            }
        }, false);

        return div;
    }
    
    
    let parent_div = document.getElementById('mad_div');

    let login_div = get_login_div(); // login screen
    let lobby_div = get_lobby_div(); //the global lobby
    let news_div = get_news_div(); // the news feed
    let room_div = get_waiting_room_div(); // the waiting room between games
    let game_canvas_div = get_game_div(); // the game board itself
    let game_scoreboard = get_scoreboard_div();//document.createElement('div'); // the scoreboard
    let chat_div = get_chat_div();
    let footer_div = document.createElement('div');
    
    parent_div.appendChild(login_div);
    parent_div.appendChild(lobby_div);
    parent_div.appendChild(room_div);
    parent_div.appendChild(game_scoreboard);
    parent_div.appendChild(game_canvas_div);
    parent_div.appendChild(chat_div);
    parent_div.appendChild(footer_div);
    parent_div.appendChild(news_div);

    if (localStorage.getItem('nickname') != null) {
        let nickname = localStorage.getItem("nickname");
        document.getElementById('input_name').value = nickname;
        socket_local.emit('login_with_name', nickname);
        let p_name = document.getElementById('player_name');
        p_name.innerHTML = `Playing as ${nickname}`
        switch_to_lobby_gui();
    }
    else {
        switch_to_login_gui();
    }
    

    // document.getElementById("para").onclick = function() {  }
}

function x() {
    sprite_sheet = new Image();
    sprite_sheet.src = './img/sprites7.png';
    
    
    window.requestAnimationFrame(() => game_loop_client()); // start the game loop
}

populate_gui();
x();

