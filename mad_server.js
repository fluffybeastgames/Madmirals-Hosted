"use strict";

const path_finder = require("./path_finder");
// const mad_common = require("./mad_common");
// const c = require("./mad_constants");

// let games = {};

let sockets = [];
let room_ids = []; //['r_00000001'];
let games = []; //[{game_id='g_00000001', players=[], num_rows=x, num_cols=y, game_status = 'Init', game_turn = 0, game_mode = 'ffa', board=[]}]
let rooms = []; //an array of room objects. Each room object contains a room_id, a list of players, and a game object (iniitialized to null)
const debug_mode = true;

///////////
// Shared constants
///////////

const TERRAIN_TYPE_WATER = 101;
const TERRAIN_TYPE_SWAMP = 104 ;
const TERRAIN_TYPE_MOUNTAIN = 105;
const TERRAIN_TYPE_MOUNTAIN_CRACKED = 106;
const TERRAIN_TYPE_MOUNTAIN_BROKEN = 107;

const ENTITY_TYPE_ADMIRAL = 200;
const ENTITY_TYPE_SHIP = 201;
const ENTITY_TYPE_SHIP_2 = 202 // combine 2 ships to make this. Increased growth rate;
const ENTITY_TYPE_SHIP_3 = 203 // combine 1 ship_2 with a ship to make this. Increased growth rate;
const ENTITY_TYPE_SHIP_4 = 204 // combine 2 ship_2s or 1 ship_3 and 1 ship to make this. Increased growth rate;
// const ENTITY_TYPE_INFANTRY = 205;

const ACTION_MOVE_NORMAL = 1;
const ACTION_MOVE_HALF = 2;
const ACTION_MOVE_ALL = 3;
const ACTION_MOVE_CITY = 4;
const ACTION_MOVE_NONE = 5;


const GAME_MODE_FFA = 1;
const GAME_MODE_FFA_CUST = 2;
const GAME_MODE_REPLAY = 3;

const GAME_STATUS_INIT = 0; // loading;
const GAME_STATUS_READY = 1; // able to start;
const GAME_STATUS_IN_PROGRESS = 2; //;
const GAME_STATUS_PAUSE = 3; //;
const GAME_STATUS_GAME_OVER_WIN = 4; // game instance is complete and can no longer be played;
const GAME_STATUS_GAME_OVER_LOSE = 5; // game instance is complete and can no longer be played;

const MIN_DISTANCE_ADMIRALS = 5;

const DEFAULT_TICK_SPEED = 500;

// function init_new_game(room_id) {
//     //creates a blank game in INIT mode. Can hold the settings of the lobby
//     let new_game = new Game(room_id);
// }
function start_new_game(room_id, game_data_json) {
    console.log('i am start_new_game')
    let game_data = JSON.parse(game_data_json)

    let player_socket_ids = io.sockets.adapter.rooms.get(room_id);

    let new_game = new Game(room_id, game_data, player_socket_ids);
    //let new_game;

    const i = rooms.findIndex(e => e.room_id === room_id); 
    if (i > -1) {//rooms[i] contains the room object with id room_to_join
        rooms[i].game = new_game;
        new_game.start_game();
        console.log('game started in room ', room_id)
    }
    return new_game;
    // console.log(rooms[i].game.num_rows, rooms[i].game.num_cols, rooms[i].game.players.length);
}


class Game {
    constructor(room_id, game_data, player_socket_ids) {
        this.room_id = room_id;
        this.game_id = 'g' + Math.floor(Math.random()*10**16); // TODO possibly temp - make into the room id of the lobby that created this game?
        
        console.log('game_id', this.game_id)

        this.players = []
        this.player_turn_order = []
        this.status = GAME_STATUS_INIT
        this.game_on = false; // when game_on, the game will loop every ~tick_speed ms, increasing the game_tick and advancing the simulation
        
        // For each possible game setting, use the json input value, if present, and default to random/default values
        this.fog_of_war = 'fog_of_war' in game_data? game_data.fog_of_war : Math.random() > .19;
        this.num_rows = 'n_rows' in game_data ? game_data.n_rows : 15 + Math.floor(Math.random()*15);
        this.num_cols =  'n_cols' in game_data? game_data.n_cols : 15 + Math.floor(Math.random()*25);
        this.cells = []; // will hold an array Cell objects. This will become the server-side all-knowing set of cells
        this.initialize_cells();
        this.astar_board = new path_finder.ABoard(this.num_rows, this.num_cols, 0); // used for determining the shortest traversable distance between two cells
        this.astar = new path_finder.AStar(this.astar_board);
        this.game_tick_server = -1;
        this.tick_speed = DEFAULT_TICK_SPEED; // ms to wait before rendering each new frame

        this.spectate_on_defeat = 'spectate_on_defeat' in game_data ? game_data.spectate_on_defeat : false; // TODO add to lobby settings

        this.show_all_admirals = 'show_all_admirals' in game_data ? game_data.show_all_admirals : false; // add to lobby settings


        // let player_color_options = ['#C50F1F', '#C19C00', '#881798', '#E74856', '#16C60C', '#F9A1A5', '#B4009E', '#61D6D6', '#2222F2', '#8C8C8C', '#B9B165',
        //                             '#FF0000', '#FF8000', '#00FF00', '#FF00FF'];  
        let player_color_options = ['#48b393', '#d4a70e', '#e7843e', '#3980d7', '#90c55d', '#bb6307', '#ec6363', '#3a537c', '#7c8c3a', '#c63939', '#d65084', '#6765ae', '#486b27', '#7b2525', '#a467c8', '#643b8b'];
        player_color_options = player_color_options.sort((a, b) => 0.5 - Math.random()); // loosely shuffled array of colors to assign to players

        let n_bots = 'n_bots' in game_data ? game_data.n_bots : Math.floor(Math.random()*4) + 1;; // get the number of bots to add to the game
        //allow 0 b
        let n_humans = player_socket_ids.length;
        if (n_humans < 2) {
            n_bots = Math.max(n_bots, 1); // if there is only one human player, make sure there is at least one bot
        }
        
        this.add_bots(n_bots, player_color_options.slice(0, n_bots));

        console.log('n_bots', n_bots);

        this.add_humans(player_socket_ids, player_color_options.slice(n_bots));
    
        this.spawn_admirals(0); // create an admiral entity for each player, param is the number of troops they start with
        console.log('admirals have been placed')

        let water_weight = 'water_weight' in game_data ? game_data.water_weight : 10 + Math.random();
        let mountain_weight = 'mountain_weight' in game_data ? game_data.mountain_weight : 1 + Math.random();
        let swamp_weight  = 'swamp_weight' in game_data ? game_data.swamp_weight : .1 + Math.random() / 4 ; 
        let ship_weight = 'ship_weight' in game_data ? game_data.ship_weight : .2 + Math.random() / 2;
    
        this.spawn_terrain(water_weight, mountain_weight, swamp_weight, ship_weight);
        console.log('terrain has been spawned')




    // game = new Game(n_rows, n_cols, fog_of_war, 1, human_player_info, num_bots, starting_troops, water_weight, mountain_weight, swamp_weight, ship_weight);
    // constructor(room_id, game_data, player_socket_ids) {
    //     this.room_id = room_id;
    //     this.game_id = 'g' + Math.floor(Math.random()*10**16); // TODO possibly temp - make into the room id of the lobby that created this game?
        
    //     console.log('game_id', this.game_id)

    //     this.players = []
    //     this.player_turn_order = []
    //     this.status = GAME_STATUS_INIT
    //     this.game_on = false; // when game_on, the game will loop every ~tick_speed ms, increasing the game_tick and advancing the simulation
        
    //     // For each possible game setting, use the json input value, if present, and default to random/default values
    //     this.fog_of_war = 'fog_of_war' in game_data? game_data.fog_of_war : Math.random() > .19;
    //     this.num_rows = 'n_rows' in game_data ? game_data.n_rows : 15 + Math.floor(Math.random()*15);
    //     this.num_cols =  'n_cols' in game_data? game_data.n_cols : 15 + Math.floor(Math.random()*25);
    //     this.cells = []; // will hold an array Cell objects. This will become the server-side all-knowing set of cells
    //     this.initialize_cells();
    //     this.astar_board = new path_finder.ABoard(this.num_rows, this.num_cols, 0); // used for determining the shortest traversable distance between two cells
    //     this.astar = new path_finder.AStar(this.astar_board);
    //     this.game_tick_server = -1;
    //     this.tick_speed = DEFAULT_TICK_SPEED; // ms to wait before rendering each new frame

    //     let player_color_options = ['#C50F1F', '#C19C00', '#881798', '#E74856', '#16C60C', '#F9A1A5', '#B4009E', '#61D6D6', '#2222F2', '#8C8C8C', '#B9B165',
    //                                 '#FF0000', '#FF8000', '#00FF00', '#FF00FF'];  
    //     player_color_options = player_color_options.sort((a, b) => 0.5 - Math.random()); // loosely shuffled array of colors to assign to players

    //     let n_bots = 'n_bots' in game_data ? game_data.n_bots : Math.floor(Math.random()*4) + 1;; // get the number of bots to add to the game
    //     //allow 0 b
    //     let n_humans = player_socket_ids.length;
    //     if (n_humans < 2) {
    //         n_bots = Math.max(n_bots, 1); // if there is only one human player, make sure there is at least one bot
    //     }
        
    //     this.add_bots(n_bots, player_color_options.slice(0, n_bots));

    //     console.log('n_bots', n_bots);

    //     this.add_humans(player_socket_ids, player_color_options.slice(n_bots));
    
    //     this.spawn_admirals(25); // create an admiral entity for each player, param is the number of troops they start with
    //     console.log('admirals have been placed')

    //     let water_weight = 'water_weight' in game_data ? game_data.water_weight : 10 + Math.random();
    //     let mountain_weight = 'mountain_weight' in game_data ? game_data.mountain_weight : 1 + Math.random();
    //     let swamp_weight  = 'swamp_weight' in game_data ? game_data.swamp_weight : .1 + Math.random() / 4 ; 
    //     let ship_weight = 'ship_weight' in game_data ? game_data.ship_weight : .2 + Math.random() / 2;
    
    //     this.spawn_terrain(water_weight, mountain_weight, swamp_weight, ship_weight);
    //     console.log('terrain has been spawned')


    }

    start_game() {
        this.status = GAME_STATUS_IN_PROGRESS;
        this.game_on = true;
    }

    add_humans(player_socket_ids, human_colors) {
        let i = 0;
        player_socket_ids.forEach(socket_id => {
            let sock = io.sockets.sockets.get(socket_id);
            let nickname = sock.nickname;
            this.add_human(socket_id, nickname, human_colors[i]);
            i++;
        });
    }

    add_human(socket_id, name, color) {
        let new_id = this.players.length
        this.player_turn_order.push(new_id)
        this.players.push(new HumanPlayer(this, new_id, socket_id, name, color))
        console.log('added human', socket_id, name, color)
    }

    add_bots(n_bots, bot_color_options) {      

        const bot_name_options = [ 'Admiral Blunderdome', 'Admiral Clumso', 'Admiral Tripfoot', 'Admiral Klutz', 'Admiral Fumblebum', 'Captain Bumblebling', 
                                    'Admiral Fuming Bull', 'Commodore Rage', 'Commodore Clumsy', 'Seadog Scatterbrain', 'The Crazed Seadog', 'Admiral Irritable', 
                                    'Captain Crazy', 'The Mad Mariner', 'The Lunatic Lighthousekeeper', 'The Poetic Pirate', 'The Fiery Fisherman', 'The Irascible Islander', 
                                    'The Tempestuous Troubadour', 'The Irate Inventor', 'The Eccentric Explorer', 'Tempestuous King Triton', 'Mad Mariner', 
                                    'Wrathful Wave Rider', 'Vivid Voyager', 'Rhyming Rover', 'Bluemad Admiral Bee', 'The Scarlet Steersman', 'Jocular Jade Jack Tar', 
                                    'Captain Kindly', 'Captain Cruelty', 'Commodore Limpy']; 

        for (let i = 0; i < n_bots; i++) {
            let bot_color_index = Math.floor(Math.random()*bot_color_options.length);
            let bot_color = bot_color_options[bot_color_index];
            bot_color_options.splice(bot_color_index, 1);
    
            let bot_name_index = Math.floor(Math.random()*bot_name_options.length);
            let bot_name = bot_name_options[bot_name_index];
            bot_name_options.splice(bot_name_index, 1);
    
            this.add_bot('bot personality', bot_name, bot_color);
        };
    }
    add_bot(personality, name, color) {
        let new_id = this.players.length
        this.player_turn_order.push(new_id)
        this.players.push(new Bot(this, new_id, personality, name, color))
    }
    
    initialize_cells() {
        let id = 0;
        for(let r = 0; r < this.num_rows; r++) {
            for(let c = 0; c < this.num_cols; c++) {
                this.cells.push(new CellServer(this, id, r, c));
                id++;;
            }
        }
    }

    tick() { // advance game by 1 tick
        if (this.game_on) {
            this.game_tick_server++;
            //growth phase
            this.cells.forEach(cell => {
                if(cell.owner != null) {
                    if (cell.entity == ENTITY_TYPE_ADMIRAL && this.game_tick_server % 2 == 0) { // admiral grow every 2 turns
                        cell.troops++;
                    } else if (cell.entity == ENTITY_TYPE_SHIP && this.game_tick_server % 16 == 0) {
                        cell.troops++;
                    } else if (cell.entity == ENTITY_TYPE_SHIP_2 && this.game_tick_server % 6 == 0) {
                        cell.troops++;
                    } else if (cell.entity == ENTITY_TYPE_SHIP_3 && this.game_tick_server % 2 == 0) {
                        cell.troops++;
                    } else if (cell.entity == ENTITY_TYPE_SHIP_4 && this.game_tick_server % 1 == 0) {
                        cell.troops++;
                    } else if (cell.terrain == TERRAIN_TYPE_SWAMP && this.game_tick_server % 1 == 0) { // swamps drain every turn
                        cell.troops--;
                        if (cell.troops < 0) { //check if the swamp killed off the last troops in the cell
                            cell.troops = 0;
                            cell.owner = null;
                        }
                    } else if (this.game_tick_server % 25 == 0) { // regular owned cells grow every 25 turns
                        cell.troops++;
                    }
                }
            });
    
            // Queue up bot behaviors
            if (this.game_tick_server > 2) {
                this.players.forEach(player => {
                    if (!player.is_human) {
                        player.take_move();
                    }
                });  
            };      
            
            // Execute the next queued move for each player
            for (let i = 0; i < this.players.length; i++) {
                let player;
                if (this.game_tick_server % 2 == 0) { // flip flop the turn order each round
                    player = this.players[i];
                } else {
                    player = this.players[this.players.length - i - 1];
                }
    
                let valid_move = false;
                let move, troops_to_move;
                while (!valid_move && player.queued_moves.length>0) {
                    move = player.queued_moves.shift();
                    
                    let cell_id_source, cell_id_dest;
                    cell_id_source = move.row * this.num_cols + move.col; // 0 is the topleft most cells, and there this.num_cols cols per row        
                    cell_id_dest = move.target_row * this.num_cols + move.target_col

                    console.log (`TEST: cell_id_source: ${cell_id_source}, this.cells.length: ${this.cells.length}`)
                    // Only complete the move if the queuer owns the source cell
                    if (this.cells[cell_id_source].owner == move.queuer) {                   
                        // Is it a valid destination?
                        if (this.cells[cell_id_dest].terrain == TERRAIN_TYPE_MOUNTAIN) {
                            valid_move = false;
                        } else {
                            valid_move = true;
    
                            if (move.action == ACTION_MOVE_NORMAL) { 
                                troops_to_move =  this.cells[cell_id_source].troops - 1 ;
                            } else if (move.action == ACTION_MOVE_ALL) { 
                                //if (this.cells[cell_id_source].entity != ENTITY_TYPE_ADMIRAL && this.cells[cell_id_source].entity != ENTITY_TYPE_SHIP) {
                                if (this.cells[cell_id_source].entity != ENTITY_TYPE_ADMIRAL) {
                                    troops_to_move = this.cells[cell_id_source].troops;
                                } else {troops_to_move = Math.floor(this.cells[cell_id_source].troops/2)}; // restrict the admirals to only moving half their troops at a time
                                
                            } else { //right click
                                troops_to_move =  Math.floor(this.cells[cell_id_source].troops/2);
                            }                
    
                            troops_to_move = Math.max(troops_to_move, 0); // I believe this will fix a bug where sometimes moving out of a swamp with 1 troop left would result in a neutral cell gaining +1 troops
                            
                            // If the queuer also owns the destination cell, stack their troops together
                            if (this.cells[cell_id_dest].owner == move.queuer) {
                                
                                this.cells[cell_id_source].troops -= troops_to_move;
                                this.cells[cell_id_dest].troops += troops_to_move;
    
                            } else { // Otherwise invade the destination cell
                                this.cells[cell_id_source].troops -= troops_to_move;
                                this.cells[cell_id_dest].troops -= troops_to_move;
                                if (this.cells[cell_id_dest].troops < 0) {
                                    let old_owner = this.cells[cell_id_dest].owner;
                                    
                                    this.cells[cell_id_dest].troops *= -1;
                                    this.cells[cell_id_dest].owner = move.queuer;
    
                                    if (this.cells[cell_id_dest].entity == ENTITY_TYPE_ADMIRAL) {
                                        this.cells[cell_id_dest].entity = ENTITY_TYPE_SHIP_3; // testing change where you don't stack admirals. ship 3 produces an equivalent number of troops.
                                        this.attempt_takeover(old_owner, move.queuer);
                                    };                                
                                };
                            };
    
                            if (this.cells[cell_id_dest].owner == move.queuer) { //either we owned it already or it was just taken over
                                //If we are trying to MOVE_ALL a ship, run a check on the appropriate logic (unload troops, move ship, or combine ships)
                                if([ENTITY_TYPE_SHIP, ENTITY_TYPE_SHIP_2, ENTITY_TYPE_SHIP_3, ENTITY_TYPE_SHIP_4].includes(this.cells[cell_id_source].entity) && move.action != ACTION_MOVE_HALF) { //} ) { 
                                    this.try_to_move_ship(cell_id_source, cell_id_dest, move.action);
                                } else if (this.cells[cell_id_source].entity == ENTITY_TYPE_ADMIRAL && move.action == ACTION_MOVE_ALL) { // only move admirals on 'move all'. Unlike normal 'move all', it will still leave a troop behind in its wake
                                    this.try_to_move_ship(cell_id_source, cell_id_dest, move.action);
                                };
                            };
                            
                            if (this.cells[cell_id_source].troops <= 0) { 
                                this.cells[cell_id_source].owner = null; //renounce ownership if there are no troops left on the starting cell
                            };
                        } ;
                    };
                };
            };
        };
    }

    try_to_move_ship(cell_id_source, cell_id_dest, action) {
        // Assumes this a valid move where the same player owns both cells and the action is ACTION_MOVEALL. 
        // This function calculates whether or not to move the ship and combines ships if appropriate. Also makes sure to leave 1 troop behind if a ship remains in source cell
        let source_entity = this.cells[cell_id_source].entity;
        let dest_entity = this.cells[cell_id_dest].entity;
        let dest_terrain = this.cells[cell_id_dest].terrain;
        
        if(source_entity == ENTITY_TYPE_ADMIRAL) { // if we're moving an admiral, make sure we're not moving into a ship
            if(dest_entity==null && dest_terrain==TERRAIN_TYPE_WATER) { // make sure we're able to put an admiral here
                this.cells[cell_id_source].entity = null;
                this.cells[cell_id_dest].entity = ENTITY_TYPE_ADMIRAL;
                // this.cells[cell_id_dest].troops = null;
                // this.cells[cell_id_dest].entity = ENTITY_TYPE_ADMIRAL;
                
            }
        } else if ([ENTITY_TYPE_SHIP, ENTITY_TYPE_SHIP_2, ENTITY_TYPE_SHIP_3, ENTITY_TYPE_SHIP_4, null].includes(dest_entity) && // make sure we're not moving into an admiral
                    [TERRAIN_TYPE_WATER, TERRAIN_TYPE_SWAMP].includes(dest_terrain)) { // make sure we're able to put a ship here
                
            let mast_count = 0;
            switch (source_entity) {
                case ENTITY_TYPE_SHIP: mast_count += 1; break;
                case ENTITY_TYPE_SHIP_2: mast_count += 2; break;
                case ENTITY_TYPE_SHIP_3: mast_count += 3; break;
                case ENTITY_TYPE_SHIP_4: mast_count += 4; break;
            };
            
            switch (dest_entity) {
                case ENTITY_TYPE_SHIP: mast_count += 1; break;
                case ENTITY_TYPE_SHIP_2: mast_count += 2; break;
                case ENTITY_TYPE_SHIP_3: mast_count += 3; break;
                case ENTITY_TYPE_SHIP_4: mast_count += 4; break;
            };
            
            switch (mast_count) {
                case 1: 
                    this.cells[cell_id_source].entity = null;
                    this.cells[cell_id_dest].entity = ENTITY_TYPE_SHIP;
                    break;
                case 2: 
                    this.cells[cell_id_source].entity = null;
                    this.cells[cell_id_dest].entity = ENTITY_TYPE_SHIP_2;
                    break;
                case 3: 
                    this.cells[cell_id_source].entity = null;
                    this.cells[cell_id_dest].entity = ENTITY_TYPE_SHIP_3;
                    break;
                case 4: 
                    this.cells[cell_id_source].entity = null;
                    this.cells[cell_id_dest].entity = ENTITY_TYPE_SHIP_4;
                    break;
                case 5: 
                    this.cells[cell_id_source].entity = ENTITY_TYPE_SHIP;
                    this.cells[cell_id_dest].entity = ENTITY_TYPE_SHIP_4;
                    if(action == ACTION_MOVE_ALL) {this.cells[cell_id_source].troops = 1}
                    break;
                case 6: 
                    this.cells[cell_id_source].entity = ENTITY_TYPE_SHIP_2;
                    this.cells[cell_id_dest].entity = ENTITY_TYPE_SHIP_4;
                    if(action == ACTION_MOVE_ALL) {this.cells[cell_id_source].troops = 1}
                    break;
                case 7: 
                    this.cells[cell_id_source].entity = ENTITY_TYPE_SHIP_3;
                    this.cells[cell_id_dest].entity = ENTITY_TYPE_SHIP_4;
                    if(action == ACTION_MOVE_ALL) {this.cells[cell_id_source].troops = 1}
                    break;
                case 8: 
                    this.cells[cell_id_source].entity = ENTITY_TYPE_SHIP_4;
                    this.cells[cell_id_dest].entity = ENTITY_TYPE_SHIP_4;
                    if(action == ACTION_MOVE_ALL) {this.cells[cell_id_source].troops = 1}
                    break;                    
            };    
            
        } else if (action == ACTION_MOVE_ALL) { // instead of abandoning ship, leave one troop behind
            this.cells[cell_id_source].troops += 1
        };
            
    }

    attempt_takeover(victim_id, culprit_id) {
    // When one player captures another's admiral, see if they nabbed their last one. If, so the player is out of the game and their remaining cells transfer to the capturer
    // console.log('attempt takeover - ', victim_id, culprit_id)
    let admirals_remaining = this.players[victim_id].admiral_count();
        if (admirals_remaining == 0) { //admiral captured!
            
            this.players[victim_id].defeated = true;

            //broadcast it to the players
            this.send_message_to_game_room(`${this.players[culprit_id].display_name} captured ${this.players[victim_id].display_name}`);

            this.cells.forEach(cell => {
                if(cell.owner == victim_id) {
                    cell.owner = culprit_id;
                    cell.troops = Math.max(Math.floor(cell.troops/2), 1);
                    if (cell.entity == ENTITY_TYPE_ADMIRAL) {
                        cell.entity = ENTITY_TYPE_SHIP_4;
                    }
                };
            });  
        };
    }



    distance_to_nearest_admiral(from_address) { // gets the Manhattan distance to the nearest admiral. Returns 999 if none found
        let closest_entity = 999;
        let ref_row = this.cells[from_address].row
        let ref_col = this.cells[from_address].col
        
        this.cells.forEach(cell => {
            // console.log(`Closest entity so far: ${closest_entity}`)
            if (cell.entity == ENTITY_TYPE_ADMIRAL) {
                let distance = Math.abs(ref_row - cell.row) + Math.abs(ref_col - cell.col)
                if (distance > 0 && distance < closest_entity) {
                    closest_entity = distance
                };
            };
        });
        
        // console.log(`Closest entity ${closest_entity}`)
        return closest_entity
    
    }
    
    spawn_admirals(starting_troops) {
        for (let i = 0; i < this.players.length; i++) {
            let not_found = true;
            while (not_found) {
                let rand_cell_id = Math.floor(Math.random() * this.num_rows * this.num_cols);
                if (this.cells[rand_cell_id].owner == null && this.distance_to_nearest_admiral(rand_cell_id) > MIN_DISTANCE_ADMIRALS) {
                    this.cells[rand_cell_id].owner = i;
                    this.cells[rand_cell_id].troops = starting_troops;
                    this.cells[rand_cell_id].entity = ENTITY_TYPE_ADMIRAL;
                    not_found = false;
                }
            } 
        }
    }
    
    get_parent_node(conn, curPoint) { // used in map_is_fully_connected
        while (conn[curPoint] !== curPoint) {
            conn[curPoint] = conn[conn[curPoint]]
            curPoint = conn[curPoint]
        }
        return curPoint
        }

    cell_is_obstacle(cell) { return cell.terrain === TERRAIN_TYPE_MOUNTAIN } // this may grow to include other terrain features (cracked and broken mountains, land, ...)

    within_map(x, y) { // Returns true if the cell is in bounds
        return 0 <= x && x < this.num_rows && 0 <= y && y < this.num_cols;
    }

    map_is_fully_connected(obstacleCount) {
        // An implementation of a disjoint set union, allowing us to very quickly check whether or not the entire map is traversable
        const conn = new Array(this.num_rows * this.num_cols).fill().map((_, i) => i);
        const size = new Array(this.num_rows * this.num_cols).fill(1);

        for (let i = 0; i < this.num_rows; i++) {
            for (let j = 0; j < this.num_cols; j++) {
                const cell_id = i * this.num_cols + j;
                if (!this.cell_is_obstacle(this.cells[cell_id])) {
                    const curPoint = i * this.num_cols + j;
                    const neighbors = [
                        { x: i - 1, y: j },
                        { x: i, y: j - 1 }
                    ];
                    for (const neighbor of neighbors) {
                        const { x, y } = neighbor;
                        const neighbor_id = x * this.num_cols + y;
                        if (this.within_map(x, y) && !this.cell_is_obstacle(this.cells[neighbor_id])) { //if the neighbor is in bounds and is not a mountain
                            const lastPoint = x * this.num_cols + y;
                            const curParent = this.get_parent_node(conn, curPoint);
                            const lastParent = this.get_parent_node(conn, lastPoint);
                            if (curParent !== lastParent) {
                                if (size[lastParent] > size[curParent]) {
                                    conn[curParent] = lastParent;
                                    size[lastParent] += size[curParent];
                                } else {
                                    conn[lastParent] = curParent;
                                    size[curParent] += size[lastParent];
                                }
                            }
                        }
                    }
                }
                if (size[this.get_parent_node(conn, i * this.num_cols + j)] >= this.num_rows * this.num_cols - obstacleCount) {
                    return true; // all non-obstacle cells are connected in a single union
                }
            }
        }

        return false; // failed to converge on a single traversable union
    }
        
    spawn_terrain(water_weight, mountain_weight, swamp_weight, ship_weight) {
        let num_mountains = 1; 
        
        let arr_options = [
            {'value': TERRAIN_TYPE_WATER, 'weight':water_weight},
            {'value': TERRAIN_TYPE_MOUNTAIN, 'weight':mountain_weight},
            {'value': TERRAIN_TYPE_SWAMP, 'weight':swamp_weight},
            {'value': ENTITY_TYPE_SHIP, 'weight':ship_weight},
        ];
        this.cells.forEach(cell => {
            // console.log(cell.id, cell.row, cell.col)
            if(cell.owner == null) {
                let result = weighted_choice(arr_options).value;
                if (result == ENTITY_TYPE_SHIP) {
                    cell.terrain = TERRAIN_TYPE_WATER
                    cell.entity = result
                    cell.troops = Math.floor(Math.random()*30)+12
                } else if (result == TERRAIN_TYPE_MOUNTAIN) {
                    cell.terrain = result; // tentatively set it to mountain
                    if (!this.map_is_fully_connected(num_mountains)) { // if this would create an impasse, remove the mountain
                        cell.terrain = TERRAIN_TYPE_WATER;
                    } else {
                        this.astar_board.cells[cell.id].traversable = false;
                        num_mountains += 1;
                    }
                } else {
                    cell.terrain = result;
                }
                // this.astar.print_board([0,0], [1,1]);
            };
        });
    }
    
    send_message_to_game_room(message) {
        io.to(this.room_id).emit('receive_chat_message', message)
    }
        
    //An attempt at predicting what the server to client communication will look like
    send_game_state_to_players(emit_code) {
        this.players.forEach(player => {
            if (player.is_human) {
                this.send_game_state_to(player.uid, emit_code);
            }
        } );
    }

    send_game_state_to(uid, emit_code) {
        //uid is the player's position in the players[] list, as opposed to their socket id
        
        let socket_id = this.players[uid].socket_id;
        console.log('send_game_state_to', uid, socket_id, emit_code);
        // // let player_id = 0;
        
        //temp: HERE
        let next_queue_id = this.players[uid].queued_moves.length > 0 ? this.players[uid].queued_moves[0].id : -1; // if there are any items remaining in the queue, let them know which ones we've eliminated this turn. -1 will indicate to the client that the queue is empty
        // let next_queue_id = this.players[socket_id].queued_moves.length > 0 ? this.players[socket_id].queued_moves[socket_id].id : -1; // if there are any items remaining in the queue, let them know which ones we've eliminated this turn. -1 will indicate to the client that the queue is empty

        // Start with header information about the game
        let game_string = '{ "game": {' +
            `"game_id" : "${this.game_id}",` +
            `"state" : "${this.game_on}",` +
            `"turn": "${this.game_tick_server}",` +
            `"n_rows": "${this.num_rows}",` +
            `"n_cols": "${this.num_cols}",` +
            `"next_queue_id": "${next_queue_id}"` +
            '}, "board":[  '; // the two trailing spaces are intentional -- if no board cells are included, then the slicing below will still work smoothly

        
        // Then loop through and add info about each visible cell
        let fog_of_war_distance = 1; // if 2 or greater, the player can see 2 blocks away from them instead of just 1
        this.cells.forEach(cell => {
            if (this.should_be_visible(cell, uid, fog_of_war_distance)) {
                let cell_string = `{ "id":${cell.id}, "row":${cell.row}, "col":${cell.col}`;
                if (cell.owner != null) {cell_string += `, "owner":${cell.owner}`}
                if (cell.terrain != TERRAIN_TYPE_WATER) {cell_string += `, "terrain":${cell.terrain}`}
                if (cell.entity != null) {cell_string += `, "entity":${cell.entity}`}
                if (cell.troops != null) {cell_string += `, "troops":${cell.troops}`}
                if (true) {cell_string += `, "visible":true`}
    
                cell_string += '}, '
                game_string += cell_string ;
            }
            else if (cell.terrain == TERRAIN_TYPE_MOUNTAIN || [ENTITY_TYPE_SHIP, ENTITY_TYPE_SHIP_2, ENTITY_TYPE_SHIP_3, ENTITY_TYPE_SHIP_4].includes(cell.entity)) {
                let cell_string = `{ "id":${cell.id}, "row":${cell.row}, "col":${cell.col}`;
                cell_string += `, "terrain":${TERRAIN_TYPE_MOUNTAIN}`
                if (true) {cell_string += `, "visible":false`}
    
                cell_string += '}, '
                game_string += cell_string ;
            };
        });

        game_string = game_string.slice(0,-2); // remove the last two characters from the string - either remove a trailing ', ' or if no cells are included then then the '  ' from the end of the header
        game_string += '], "scoreboard":[  '; // close the board loop and start adding the scoreboard
        
        for (let i = 0; i < this.players.length; i++) {
            game_string += `{"id":"${i}", "display_name": "${this.players[i].display_name}", "troops": ${this.players[i].troop_count()}, "ships": ${this.players[i].ship_count()}, "admirals": ${this.players[i].admiral_count()}, "color": "${this.players[i].color}" }, `   
        };

        game_string = game_string.slice(0,-2); // remove the last two characters from the string - always a trailing ', ' since there's always going to be 1+ players
        game_string += '] }'; // close the scoreboard and whole json object
        
        io.to(socket_id).emit(emit_code, game_string);  
    }

    should_be_visible(cell, player_id, fog_of_war_distance) {
        if (!this.fog_of_war) {
            return true;
        // } else if (cell.owner == player_id || cell.terrain == TERRAIN_TYPE_MOUNTAIN) { 
        //     return true; 
        } else if (this.spectate_on_defeat && this.players[player_id].defeated) {
            return true;
        } else if (cell.owner == player_id) { 
            return true; 
        } else if (cell.entity == ENTITY_TYPE_ADMIRAL && this.show_all_admirals) {
            return true;
        } else {
            // let distance = 1
            // if ([ENTITY_TYPE_SHIP, ENTITY_TYPE_SHIP_2, ENTITY_TYPE_SHIP_3, ENTITY_TYPE_SHIP_4].includes(cell.entity)) {
            //     distance = 2;
            // }
            return (this.get_owned_neighbors(cell, player_id, fog_of_war_distance) > 0);
        }
    }
    get_owned_neighbors(cell, player_id, fog_of_war_distance) { // Returns the number of adjacent cells owned by the provided player_id. Normally, this is used to determine if a cell should be visible to said user
        let num_neighbors = 0;

        let cells_to_check = [
            [cell.row-1, cell.col-1],[cell.row-1, cell.col],[cell.row-1, cell.col+1],
            [cell.row, cell.col-1],[cell.row, cell.col+1],
            [cell.row+1, cell.col-1],[cell.row+1, cell.col],[cell.row+1, cell.col+1]];

        if (fog_of_war_distance > 1) {
            cells_to_check = cells_to_check.concat( 
                [
                    [cell.row-2, cell.col-2],[cell.row-2, cell.col-1],[cell.row-2, cell.col],[cell.row-2, cell.col+1],[cell.row-2, cell.col+2],
                    [cell.row-1, cell.col-2],[cell.row-1, cell.col-1],[cell.row-1, cell.col],[cell.row-1, cell.col+1],[cell.row-1, cell.col+2],
                    [cell.row, cell.col-2],[cell.row, cell.col-1],[cell.row, cell.col+1],[cell.row, cell.col+2],
                    [cell.row+1, cell.col-2],[cell.row+1, cell.col-1],[cell.row+1, cell.col],[cell.row+1, cell.col+1],[cell.row+1, cell.col+2],
                    [cell.row+2, cell.col-2],[cell.row+2, cell.col-1],[cell.row+2, cell.col],[cell.row+2, cell.col+1],[cell.row+2, cell.col+2],
                ]
            );
        };

        cells_to_check.forEach(cell => {
            if(cell[0] >= 0 && cell[1] >= 0 && cell[0] < this.num_rows && cell[1] < this.num_cols) {
                num_neighbors += (this.get_cell_by_coords(cell[0], cell[1]).owner == player_id) ? 1 : 0; 
            };
        });
        return num_neighbors
    }

    get_cell_by_coords(row, col) { // Returns the server cell object at the given row and column
        return this.cells[row*this.num_cols+col]
    }

    check_for_game_over() {
        //if the game has been won, lost, or abandoned, mark it as such and alert the user

        let troop_count = new Array(this.players.length).fill(0);
        let admiral_count = new Array(this.players.length).fill(0);
        this.cells.forEach(cell => {
            if (cell.owner != null) {
                troop_count[cell.owner] += cell.troops;
                if (cell.entity == ENTITY_TYPE_ADMIRAL) { 
                    admiral_count[cell.owner]++;
                };            
            }
        });
        
        let remaining_humans_count = 0; // make sure at least 1 human player is still in the game
        let remaining_bots_count = 0; // make sure at least 1 human player is still in the game
        let remaining_human_name = '' // if there is exactly 1 human player left, this will identify them in chat

        for (let i = 0; i < admiral_count.length; i++) {
            if (admiral_count[i] > 0 && this.players[i].is_human) {
                remaining_humans_count++;
                remaining_human_name = this.players[i].display_name;
            } else if (admiral_count[i] > 0 && !this.players[i].is_human) {
                remaining_bots_count++;
            };
        };

        if (remaining_humans_count == 0) {
            this.game_on = false;
            this.status = GAME_STATUS_GAME_OVER_LOSE;
            console.log('Game over! Humans lose.'); // TODO pass this info on to the client
            this.send_message_to_game_room('Game over! Humans lose.')

        } else if (remaining_bots_count == 0 && remaining_humans_count == 1) {
            this.game_on = false;
            this.status = GAME_STATUS_GAME_OVER_WIN;
            console.log(`Game over! Player wins!!!`); // TODO pass this info on to the client
            this.send_message_to_game_room(`${remaining_human_name} wins!`)
        };
    };
}

class CellServer {
    constructor(parent, id, row, col) {
        this.parent = parent // the game object that this belongs to
        this.id = id //position w/in the 1d array of cells
        this.row = row;
        this.col = col;
        this.owner = null
        this.troops = 0
        this.terrain = TERRAIN_TYPE_WATER //water is traversable, mountains are not
        this.entity = null // what type of entity (if any) is here - eg admiral
    }   

    neighbor(dir) { //returns the neighboring cell. If out of bounds, returns null
        if(dir=='left' && this.col>0) { 
            return this.parent.cells[this.id-1]
        } else if (dir=='right' && this.col < this.parent.num_cols - 1) { 
            return this.parent.cells[this.id+1]
        } else if (dir=='up' && this.row>0) { 
            return this.parent.cells[this.id - this.parent.num_cols]
        } else if (dir=='down' && this.row < this.parent.num_rows - 1) { 
            return this.parent.cells[this.id + this.parent.num_cols]
        } else {
            return null;
        }

        
    }
}

class HumanPlayer {
    constructor(parent, uid, socket_id, name, color) {
        this.parent = parent; // the game object that owns this player
        this.uid = uid; // 0-n, may be unecessary as we can use the position in Players[] as the uid
        this.display_name = name;
        this.socket_id = socket_id; // the session ID of the connected player
        this.color = color; //temp. green
        this.queued_moves = [];
        this.is_human = true;
        this.defeated = false; // false if they're still in the game
    
    }
    
    admiral_count() {
        let counter = 0;
        this.parent.cells.forEach(cell => {
            if (cell.owner == this.uid && cell.entity == ENTITY_TYPE_ADMIRAL) {counter ++} 
        });
        return counter
    }

    troop_count() {
        let counter = 0;
        this.parent.cells.forEach(cell => {
            if (cell.owner == this.uid) {counter += cell.troops} 
        });
        return counter
    }

    cell_count() {
        let counter = 0;
        this.parent.cells.forEach(cell => {
            if (cell.owner == this.uid) {counter ++} 
        });
        return counter
    }

    ship_count() {
        let counter = 0;
        this.parent.cells.forEach(cell => {
            // if (cell.owner == this.uid && [ENTITY_TYPE_SHIP, ENTITY_TYPE_SHIP_2, ENTITY_TYPE_SHIP_3,ENTITY_TYPE_SHIP_4].includes(cell.entity)) {counter ++} 
            if (cell.owner == this.uid) {
                switch (cell.entity) {
                    case ENTITY_TYPE_SHIP: counter += 1; break;
                    case ENTITY_TYPE_SHIP_2: counter += 2; break;
                    case ENTITY_TYPE_SHIP_3: counter += 3; break;
                    case ENTITY_TYPE_SHIP_4: counter += 4; break;
                };
            };
        });
        return counter
    }
    
}

class Bot {
    constructor(parent, uid, personality, name, color) {
        this.parent = parent; // the game object that owns this player
        this.uid = uid;
        this.display_name = name;
        this.personality = personality;
        this.color = color;
        this.queued_moves = []
        this.is_human = false;
        this.defeated = false; // false if they're still in the game, keep in the scoreboard but ignore during gameplay
    }

    admiral_count() {
        let counter = 0;
        this.parent.cells.forEach(cell => {
            if (cell.owner == this.uid && cell.entity == ENTITY_TYPE_ADMIRAL) {counter ++} 
        });
        return counter
    }

    troop_count() {
        let counter = 0;
        this.parent.cells.forEach(cell => {
            if (cell.owner == this.uid) {counter += cell.troops} 
        });
        return counter
    }

    cell_count() {
        let counter = 0;
        this.parent.cells.forEach(cell => {
            if (cell.owner == this.uid) {counter ++} 
        });
        return counter
    }
    
    ship_count() {
        let counter = 0;
        this.parent.cells.forEach(cell => {
            if (cell.owner == this.uid && [ENTITY_TYPE_SHIP, ENTITY_TYPE_SHIP_2, ENTITY_TYPE_SHIP_3,ENTITY_TYPE_SHIP_4].includes(cell.entity)) {counter ++} 
        });
        return counter
    }
    

    take_move() {
        if (this.queued_moves.length < 1) {
            let action_choice = Math.random();
            // this.attack_something();

            if (action_choice < .1) {
                this.attack_something();
            } else if (action_choice <.15) {
                this.gather_troops();
            }
            this.grow();
        }
    }

    attack_something() {
        // console.log('attack_something')
        let potential_targets = []; // which entity should we send troops to?
        let potential_origins = []; // where to start gathering troops

        this.parent.cells.forEach(cell => {
            if(cell.owner != this.uid) {
                switch (cell.entity) {
                    case ENTITY_TYPE_ADMIRAL: potential_targets.push({'address':[cell.row, cell.col], 'weight':100}); break;
                    case ENTITY_TYPE_SHIP: potential_targets.push({'address':[cell.row, cell.col], 'weight':10}); break;
                    case ENTITY_TYPE_SHIP_2: potential_targets.push({'address':[cell.row, cell.col], 'weight':20}); break;
                    case ENTITY_TYPE_SHIP_3: potential_targets.push({'address':[cell.row, cell.col], 'weight':30}); break;
                    case ENTITY_TYPE_SHIP_4: potential_targets.push({'address':[cell.row, cell.col], 'weight':75}); break;
                };
            } else {
                potential_origins.push({'address':[cell.row, cell.col], 'weight': cell.troops-1}); //prioritize starting w/ larger piles of cells to increase the number of cells per move involved. troops-1 to ensure we ignore cells with fewer than 2 troops
            }
        });

        if (potential_origins.length > 0 && potential_targets.length > 0) {
            let origin_address = weighted_choice(potential_origins);
            let target_address = weighted_choice(potential_targets);

            // console.log(origin_address.address, origin_address.weight)
            // console.log(target_address.address, target_address.weight)

            if (origin_address && target_address) {
                let path = this.parent.astar.find_path(origin_address.address, target_address.address);
                if (path) {
                    for (let i = 0; i < path.length - 1; i++) {
                        let new_move = {'id':-1, 'row':path[i][0], 'col':path[i][1], 'dir':'n/a',
                                        'queuer':this.uid,'target_row':path[i+1][0], 'target_col':path[i+1][1], 
                                        'action':ACTION_MOVE_NORMAL}
                        this.queued_moves.push(new_move);
                    };
                };
            };
            //console.log(path)
        };        

    }

    gather_troops() {
        // console.log('gather_troops')
        let potential_targets = []; // which entity should we send troops to?
        let potential_origins = []; // where to start gathering troops

        this.parent.cells.forEach(cell => {
            if(cell.owner == this.uid) {
                switch (cell.entity) {
                    case ENTITY_TYPE_ADMIRAL: potential_targets.push({'address':[cell.row, cell.col], 'weight':100}); break;
                    case ENTITY_TYPE_SHIP: potential_targets.push({'address':[cell.row, cell.col], 'weight':10}); break;
                    case ENTITY_TYPE_SHIP_2: potential_targets.push({'address':[cell.row, cell.col], 'weight':20}); break;
                    case ENTITY_TYPE_SHIP_3: potential_targets.push({'address':[cell.row, cell.col], 'weight':30}); break;
                    case ENTITY_TYPE_SHIP_4: potential_targets.push({'address':[cell.row, cell.col], 'weight':100}); break;
                    case null: potential_origins.push({'address':[cell.row, cell.col], 'weight': cell.troops-1}); break; //prioritize starting w/ larger piles of cells to increase the number of cells/move that end up in the entity. troops-1 to ensure we ignore cells with fewer than 2 troops
                };
            };
        });

        if (potential_origins.length > 0 && potential_targets.length > 0) {
            let origin_address = weighted_choice(potential_origins);
            let target_address = weighted_choice(potential_targets);

            if (origin_address && target_address) {
                let path = this.parent.astar.find_path(origin_address, target_address);
                if (path) {
                    path.forEach(cell => {
                        let new_move = {'id':-1, 'row':cell.address[0], 'col':cell.address[1], 'dir':'n/a',
                                        'queuer':this.uid,'target_row':target_address.address[0], 'target_col':target_address.address[1], 
                                        'action':ACTION_MOVE_NORMAL}
                        this.parent.players[this.uid].queued_moves.push(new_move);
                    })
                };
            };
        };
    }

    grow() { // a bot behavior that emphasizes growth over safey or combat. However, it will probably try to take over admirals and ships, given the chance
        function eval_potential_move(cell, target, this_uid, troop_count) {        
            //Evaluate the given situation and assign it a weight based on its suspected quality
            let cell_ratio = (cell.troops - target.troops)/ troop_count;
            if (target.terrain == TERRAIN_TYPE_MOUNTAIN) {return [0, ACTION_MOVE_NONE]} // don't try to grow into mountains (not yet, anyway)            
            if (cell.troops <= 1) {return [0, ACTION_MOVE_NONE]}; // don't try growing if you don't have any troops to spare
            
            let weight = 0;
            let move_mode = ACTION_MOVE_NORMAL;
            if (target.owner == this_uid) { weight += 1 };
            if (target.owner == null) { weight += 15 };
            if (target.owner != this_uid && target.troops < cell.troops + 1) { weight += 10 };
            if (target.owner != this_uid && target.troops < cell.troops + 1 && target.entity == ENTITY_TYPE_ADMIRAL) { weight += 40 }; //strongly prioritize capturing enemy admirals
            if (target.owner != this_uid && target.troops < cell.troops + 1 && target.entity == ENTITY_TYPE_SHIP) { 
                weight += 10;
                move_mode = ACTION_MOVE_ALL;
            } //also capturing enemy ships
            if (target.owner != this_uid && target.troops >= cell.troops + 1) { weight += 2 };
            if (cell.terrain == TERRAIN_TYPE_SWAMP && target.terrain == TERRAIN_TYPE_WATER) { 
                weight += 25;
                move_mode = ACTION_MOVE_ALL;
            }
            if (target.terrain == TERRAIN_TYPE_SWAMP) { weight -= 15 };
            
            // console.log(weight, cell.troops, troop_count, cell_ratio)
            weight = Math.max(weight * cell_ratio, 0);
            //return [Math.max(weight, 0), ACTION_MOVE_NORMAL];
            return [weight, move_mode];
        };
        
        let potential_moves = [];
        let neighbor_left, neighbor_right, neighbor_up, neighbor_down, weight;
        let troop_count = this.parent.players[this.uid].troop_count();

        let pm_id = 0; // a counter

        this.parent.cells.forEach(cell => {
            if(cell.owner == this.uid) {
                neighbor_left = cell.neighbor('left');
                neighbor_right = cell.neighbor('right');
                neighbor_up = cell.neighbor('up');
                neighbor_down = cell.neighbor('down');
                
                if(neighbor_left)   { 
                    let result = eval_potential_move(cell, neighbor_left, this.uid, troop_count);
                    potential_moves.push({'id':pm_id++, 'move_mode':result[1], 'source_cell':cell, 'target_cell': neighbor_left, 'dir':'left', 'weight': result[0]});
                };
                
                if(neighbor_right)  { 
                    let result = eval_potential_move(cell, neighbor_right, this.uid, troop_count);
                    potential_moves.push({'id':pm_id++, 'move_mode':result[1], 'source_cell':cell, 'target_cell': neighbor_right, 'dir':'right', 'weight': result[0]})
                };
                
                if(neighbor_up)     { 
                    let result = eval_potential_move(cell, neighbor_up, this.uid, troop_count);
                    potential_moves.push({'id':pm_id++, 'move_mode':result[1], 'source_cell':cell, 'target_cell': neighbor_up, 'dir':'up', 'weight': result[0]})
                };
                
                if(neighbor_down)   { 
                    let result = eval_potential_move(cell, neighbor_down, this.uid, troop_count);
                    potential_moves.push({'id':pm_id++, 'move_mode':result[1], 'source_cell':cell, 'target_cell': neighbor_down, 'dir':'down', 'weight': result[0]})
                };
            };
        });

        //let num_moves_to_queue = Math.floor(Math.random()*5+1); // queue up to this many moves at a time - compromise between performance and quick thinking of bot's part
        let num_moves_to_queue = Math.floor(Math.random()*3+1); // queue up to this many moves at a time - compromise between performance and quick thinking of bot's part
        num_moves_to_queue = Math.min(potential_moves.length, num_moves_to_queue);

        for (let i = 0; i < num_moves_to_queue; i++) {
            if (potential_moves.length > 0) {
                let result = weighted_choice(potential_moves)

                if (result) {
                    // console.log(result)
                    let row = result.source_cell.row
                    let col = result.source_cell.col
                    let target_row = result.target_cell.row
                    let target_col = result.target_cell.col
                    
                    let new_move = {'id':-1, 'row':row, 'col':col, 'dir':result.dir, 
                                    'queuer':this.uid,'target_row':target_row, 'target_col':target_col, 'action':result.move_mode}
                    this.parent.players[this.uid].queued_moves.push(new_move);

                    //console.log(`tick: ${game_tick_server} move_id: ${result.id};  ${row}x${col} ${result.dir} to ${target_row}x${target_col}, queue: ${this.queued_moves.length}, winning weight ${result.weight} `)

                    // Remove result from list of potential_moves for the remainder of the turn
                    potential_moves = potential_moves.filter(item => item.cell !== result.cell)
                };
            };
        };
    };
}

function weighted_choice(arr_options) {
//Given an array of objects containing a key 'weight' containing a non-negative number. The bigger the number, the more likely it is to be picked
    let total_weight = 0; 
    arr_options.forEach(option => { total_weight += Math.max(option.weight,0) }); // sum up the individual weights to determine the scale of our randrange

    let rand_weight = Math.random()*total_weight;

    let traversed_weight = 0, arr_pos = -1;
    while(traversed_weight < rand_weight && arr_pos < arr_options.length - 1) {
        arr_pos++;
        traversed_weight += arr_options[arr_pos].weight
    }
    return arr_options[arr_pos]
}
    
function test_weighted_choice() {
    let num_tests = 10000;
    let weighted_choice_data = [
        {'value1':'value_0', 'other_val_1':'test', 'weight':0}, // 0 should never be selected
        {'value1':'value_1', 'other_val_1':'test', 'weight':1},
        {'value1':'value_2', 'other_val_1':'test', 'weight':2},
        {'value1':'value_3', 'other_val_1':'test', 'weight':3},
        {'value1':'value_4', 'other_val_1':'test', 'weight':4},
        {'value1':'value_5', 'other_val_1':'test', 'weight':5},
        {'value1':'value_6', 'other_val_1':'test', 'weight':6},
        {'value1':'value_7', 'other_val_1':'test', 'weight':7},
        {'value1':'value_8', 'other_val_1':'test', 'weight':8},
        {'value1':'value_9', 'other_val_1':'test', 'weight':9}, // a weight of 9 should be selected ~9x as often as a weight of 1
        {'value1':'value_10', 'other_val_1':'test', 'weight':-10}, // should default to 0
    ];

    let arr_results = new Array(11).fill(0);

    for (let i = 0; i < num_tests; i++) {
        let result = weighted_choice(weighted_choice_data)
        arr_results[result.weight] ++
    };
    console.log(arr_results) // results with a sample size of 10,000: [0, 240, 447, 711, 851, 1127, 1322, 1586, 1710, 2006, 0]
}


function mad_log(msg) {
    console.log(msg);
    // let emitted = io.to('mad_log').emit(msg);
    io.emit('mad_log', msg);
    // console.log(emitted);
    
}

function update_room_info() {
    // updates the list of players in the room, the designated host, and the current values of the game settings
    // let room_info = {'players':[], 'host':'', 'game_mode':'', 'map_size':'', 'fog_of_war':'', 'game_speed':''}
}

function update_lobby_info() {
// Updates the list of active rooms and returns a list of currently open rooms and their statuses
    let list_open_rooms = []
    // console.log('update_lobby_info')    
    rooms.forEach(room => {
        // console.log('Emitting to room ' + room.room_id)
        let g_room = io.sockets.adapter.rooms.get(room.room_id);
        if(g_room) {
            let players = g_room.size
        
            let room_row = {'room_id':room.room_id, 'game_mode':'Free For All', 'players':`${players}`, 'bots':'2','status':'Open'}
            list_open_rooms.push(room_row)
        }

    });
    return list_open_rooms

}


const express = require('express');
const app = express();
const http = require('http');
const { connect } = require("http2");
const { emit } = require("process");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);


app.use(express.static(__dirname + '/public'));
// app.use(express.static('./'))
// app.use(express.static('./assets/')); // enable node to access the assets folder

// app.get('/', (req, res) => {
//     res.sendFile(__dirname + '/index.html');
// });

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/socket_design.html');
});

class Room {
    constructor(host_id) {
        this.room_id = 'r' + Math.floor(Math.random()*10**8); // use a sufficiently random identifier for the room
        this.game = new Game(this.room_id, {}, []);
        this.players = [];
        this.status = 'open';
        //this.host = host_id;

    }

    is_host(socket_id) {
        // return this.host;
        return io.sockets.adapter.rooms.get(this.room_id)[0] == socket_id;
    }
    
    send_player_list() {
        let player_socket_ids = io.sockets.adapter.rooms.get(this.room_id);
        let i = 0;
        let list_players = [];
        player_socket_ids.forEach(socket_id => {
            let sock = io.sockets.sockets.get(socket_id);
            let nickname = sock.nickname;
            list_players.push(nickname)
            i++;
        });
        io.to(this.room_id).emit('update_player_list', list_players);
    
    }

}




io.on('connection', (socket) => {
    console.log(`user with socket ${socket.id} connected`);

    ////FROM socket_design:
    // mad_log(`user ${socket.nickname} connected`)
    socket.join('lobby');
    // socket.join('global_lobby');

    socket.on('login_with_name', function(nickname) {
        socket.nickname = nickname;
        mad_log(`${socket.nickname} connected`)
    } )

    // socket.emit('client_connected')
    socket.on('change_nickname', function(old_name, new_name){ // user clicked Create Room
        socket.nickname = new_name;
        mad_log(`${old_name} changed their name to ${socket.nickname}`)
    });
    
    socket.on('create_room', function(){ // user clicked Create Room
        if(debug_mode){console.log('create_room')}

        let new_room = new Room(socket.id);
        rooms.push(new_room);
       
        socket.join(new_room.room_id); // create new room by joining it
        io.to(socket.id).emit('client_created_room', new_room.room_id)
        socket.to(new_room.room_id).emit('a_user_joined_the_room', socket.nickname)
    });

    socket.on('join_game_room', function(room_to_join){ // user clicked Join Room (while a valid room is selected?)
        if(debug_mode){console.log('join_game_room', room_to_join)}

        const i = rooms.findIndex(e => e.room_id === room_to_join); 
        if (i > -1) {//rooms[i] contains the room object with id room_to_join
            socket.join(room_to_join)
            io.to(socket.id).emit('client_joined_room', room_to_join)
            socket.to(room_to_join).emit('a_user_joined_the_room', socket.nickname)
        } else {
            console.log(`Socket ${socket.id} attempted to join non-existent room ${room_to_join}`);
        }
        
        
    });

    socket.on('leave_game_room', function(room_id){ // user clicked Leave Room button
        if(debug_mode){console.log('leave_room - room:', room_id )}
        socket.to(room_id).emit('a_user_left_the_room', socket.nickname)
        socket.leave(room_id);

        //if the user was the last human in the room, kill the room
        let g_room = io.sockets.adapter.rooms.get(room_id);
        if(!g_room) { 
            rooms = rooms.filter(item => item.room_id !== room_id); // remove the room from the list of active rooms
            console.log(`Room ${room_id} was empty and was removed from the list of active rooms`);
        }
        
    });

    socket.on('toggle_ready', function(room_id){ // user clicked "Ready"
        if(debug_mode){console.log('toggle_ready - room', room_id)}
    });

    socket.on('start_game', function(room_id, game_data_json){ // host clicked Start Game
        if(debug_mode){console.log('start_game', room_id)}
        
        let game = start_new_game(room_id, game_data_json);

        // //function request_new_game(lobby_id, game_data_json) {
        // let game_id = request_new_game(room_id, '{}');
        // games.push(game_id);
        game.send_game_state_to_players('new_game_from_server')

        // io.to(room_id).emit('tell_client_game_has_started', game_info)
    });

    socket.on('send_updated_room_settings', function(room_id, game_data_json) {
        console.log('HEREHERE!!!!');
        console.log(room_id);
        console.log(game_data_json);
        socket.to(room_id).emit('receive_updated_room_settings', game_data_json);
//HEREHERE
    })

    socket.on('add_move_to_queue', function(){ //
        if(debug_mode){console.log('add_move_to_queue')}
    });

    socket.on('send_chat_message', function(room_id, msg){ // user sent a chat message 
        if(debug_mode){console.log('send_chat_message', room_id, msg)}
        io.to(room_id).emit('receive_chat_message', socket.nickname + ': ' + msg)
    });


    ////FROM mad_server:

    socket.on('queue_new_move', (game_id, new_move) => {
        // console.log('queue_new_move', new_move, game_id);

        
        //we know the game id but not the room id.. how to get the room id? loop through rooms and find the one with the matching game id
        let room_i = null;
        for (let i = 0; i < rooms.length; i++) {
            if (rooms[i].game) {
                if (rooms[i].game.game_id == game_id) {
                    room_i = i;
                }
            }
        }
        if (room_i != null) {
            // console.log('FOUND A MATCHING ROOM new')

            //don't have the accurate queuer - currently it's set to 0 in new_move.queuer
            // so loop through the room and find the player with the matching socket id
            for (let i = 0; i < rooms[room_i].game.players.length; i++) {
                if(rooms[room_i].game.players[i].is_human) {
                    if (rooms[room_i].game.players[i].socket_id == socket.id) {
                        new_move.queuer = i;
                    }
                }
            }

            rooms[room_i].game.players[new_move.queuer].queued_moves.push(new_move);
        }
        
        // let room_id = null;
        // rooms.forEach(room => {
        //     if (room.game) {
        //         if (room.game.game_id == game_id) {
        //             room_id = room.room_id;
        //         }
        //     }
        // });

        

        // games[game_id].players[new_move.queuer].queued_moves.push(new_move);
    } );

    socket.on('undo_queued_move', (game_id, popped_item_id) => {
        // Remove all moves with an ID of or newer than popped_item_id
        console.log('undo_queued_move')

        let room_i = null;
        for (let i = 0; i < rooms.length; i++) { // loop through rooms and find the one with the matching game id
            if (rooms[i].game) {
                if (rooms[i].game.game_id == game_id) {
                    room_i = i;
                }
            }
        }
        if (room_i != null) {
            console.log('FOUND A MATCHING ROOM undo ')
            
            let player_id = -1;
            // loop through the room and find the player with the matching socket id
            for (let i = 0; i < rooms[room_i].game.players.length; i++) {
                if(rooms[room_i].game.players[i].is_human) {
                    if (rooms[room_i].game.players[i].socket_id == socket.id) {
                        player_id = i;

                        console.log('FOUND A MATCHING PLAYER')
                                    
                        let not_caught_up = true;
                        while (rooms[room_i].game.players[player_id].queued_moves.length>0 && not_caught_up) {
                            if (rooms[room_i].game.players[player_id].queued_moves[rooms[room_i].game.players[player_id].queued_moves.length - 1].id >= popped_item_id) {
                                rooms[room_i].game.players[player_id].queued_moves.pop();
                            } else { not_caught_up = false; }; //escape 
                        };
                    };
                };
            };
            
            
        };
    } );

    socket.on('cancel_move_queue', (game_id) => {
        // Remove all queued moves for the player
        console.log('cancel_move_queue')

        let room_i = null;
        for (let i = 0; i < rooms.length; i++) { // loop through rooms and find the one with the matching game id
            if (rooms[i].game) {
                if (rooms[i].game.game_id == game_id) {
                    room_i = i;
                }
            }
        }
        if (room_i != null) {
            console.log('FOUND A MATCHING ROOM cancel ')
            
            let player_id = -1;
            // loop through the room and find the player with the matching socket id
            for (let i = 0; i < rooms[room_i].game.players.length; i++) {
                if(rooms[room_i].game.players[i].is_human) {
                    if (rooms[room_i].game.players[i].socket_id == socket.id) {
                        player_id = i;

                        console.log('FOUND A MATCHING PLAYER cancel')
                        rooms[room_i].game.players[player_id].queued_moves.length = 0;
                                    
                    };
                };
            };
            
            
        };
    } );

    // socket.on('cancel_move_queue', (game_id) => {
    //     games[game_id].players[player_id].queued_moves.length = 0;
    // } );
    
    //io.to("some room").emit("some event");

    // socket.on('request_new_game', (game_data_json) => {// this needs to come from a room instead of a socket I think?
    //     console.log('request_new_game')
    //     // console.log(game_data_json)
    //     let lobby_id = -123; //TODO
    //     let new_game_id = request_new_game(lobby_id, game_data_json);
        
    //     socket.join(new_game_id);
    //     games[new_game_id].send_game_state_to(0, 'new_game_from_server');
    
    // } );

    // socket.on('toggle_pause_server', (game_id, toggle, override) => {
    //     if (game_id) {
    //         if (toggle) {
    //             console.log('Toggling pause to', games[game_id].game_on, 'game:', game_id)
    //             games[game_id].game_on = ! games[game_id].game_on
    //         }
    //         else {
    //             console.log('Setting pause to', ! override, 'game:', game_id)
    //             if (games[game_id]) {
    //                 games[game_id].game_on = override
    //             }
    //         }    
        
    //         io.emit('toggle_pause_received', games[game_id].game_on);
    //     };

    // });

    socket.on('disconnect', () => {
        console.log(`user ${socket.id} disconnected`);
        mad_log(`${socket.nickname} disconnected`)
        // if the user was in a game, remove them from the game broadcasts
        // if there are no more users in the broadcast, end the game


    });
} );

io.of("/").adapter.on("create-room", (room) => {
    console.log(`room ${room} was created`);
  });

io.of("/").adapter.on("join-room", (room, id) => {
console.log(`socket ${id} has joined room ${room}`);
});

// let port = 3000;
const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
    console.log(`Listening on *:${PORT}`);
    let start_time = Date.now()    
    setInterval(function(){ 
    // This controls the game loop. Each active game advances one tick each time this interval passes
        
        ////STARTING HERE FROM socket_design
        //Update lobby info
        let lobby_info = update_lobby_info()
        let players_in_lobby = 0;
        if (io.sockets.adapter.rooms.get('lobby')) {
            players_in_lobby = io.sockets.adapter.rooms.get('lobby').size;
        }

        let players_online = io.engine.clientsCount;

        // Send lobby info to all players in the lobby
        io.to('lobby').emit('lobby_info', lobby_info, players_in_lobby, players_online);

        // Send game info to each activer room
        rooms.forEach(room => {
            let currently_connected_sockets = io.sockets.adapter.rooms.get(room.room_id);
            if (currently_connected_sockets) { // if there are any players in the room
                console.log(currently_connected_sockets.size, 'players in room', room.room_id)
                //if game is on: 
                // console.log('Emitting to room ' + room_id)
                // io.to(room.room_id).emit('tick', game_state(room))
                if (room.game) {
                    if (room.game.status == GAME_STATUS_IN_PROGRESS) {
                        room.game.tick();
                        room.game.check_for_game_over();       

                        for (let i = 0; i < room.game.players.length; i++) {
                            if (room.game.players[i].is_human && currently_connected_sockets.has(room.game.players[i].socket_id)) { // if player is still connected
                                room.game.send_game_state_to(i, 'client_receives_game_state');
                            };
                            // io.to(room.players[i].socket_id).emit('tick', room.game.game_state(i));
                        };                                 
                    } else if (room.game.status == GAME_STATUS_INIT) {
                        // console.log(currently_connected_sockets)
                        room.send_player_list();
                    };


                } else { // in waiting room without a game - should no longer be accessible

                };
            };

        });
        ////END FROM socket_design


        //TODO partially restore this functionality in a way that doesn't break the new game creation process

        // let keys = Object.keys(games);
        // // console.log(keys);
        // for (let i = 0; i < keys.length; i++) {
        //     let g = games[keys[i]];
        //     // console.log(`Game ${i} - id:${g.game_id}, Size: ${g.num_rows} x ${g.num_cols} - tick ${g.game_tick_server}, status/game on: ${g.status}, ${g.game_on}`);
            
        //     if (g.status == GAME_STATUS_IN_PROGRESS && g.game_on) {
        //         console.log('tick - ', g.game_id, g.game_tick_server)
        //         g.check_for_game_over(); //todo
        //         g.tick(); // check each cell to see if it should be alive next turn and update the .alive tag                
        //         g.send_game_state_to_players();
        //     } else if ([GAME_STATUS_GAME_OVER_LOSE, GAME_STATUS_GAME_OVER_WIN].includes(g.status)) { 
        //         console.log('TODO end game')

        //     };
            
        // }

    }, DEFAULT_TICK_SPEED);
});

console.log('gee whiz')
