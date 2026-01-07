import { REST, Routes, EmbedBuilder, Client, ButtonStyle, ButtonBuilder, Events, GatewayIntentBits, BaseGuildVoiceChannel, ActionRowBuilder, StringSelectMenuBuilder, InteractionType, Embed, NewsChannel, CategoryChannel } from 'discord.js';
import config from './config.json' with { type: "json" };
import { initializeEconomyDB } from './database.js';

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildVoiceStates, 
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ] 
});

initializeEconomyDB();

/* Commands */
import { registerVoiceButton } from './Commands/VoiceButtons.js';
registerVoiceButton(client);
import { registerMessageClearCommand } from './Commands/MessageClear.js';
registerMessageClearCommand(client);
import { registerMessageUserClearCommand } from './Commands/MessageUserClear.js';
registerMessageUserClearCommand(client);
import { registerCommands } from './registerCommands.js';

/* Commands/Casino */
import { registerMoneyCommand } from './Commands/money.js';
registerMoneyCommand(client);
import { registerCoinflipCommand } from './Commands/Casino/Coin.js';
registerCoinflipCommand(client);

/* Events */
import { registerVoiceChatClear } from './Events/VoiceChatClear.js'
registerVoiceChatClear(client);
import { registerDeletechannel } from './Events/ChannelDelete.js';
registerDeletechannel(client);
import { registerChannelButton } from './Events/ChannelCreate.js';
registerChannelButton(client);

client.login(config.token);
client.on('ready', async () => {
    console.log(`✅ Bot authorized as ${client.user.tag}!`);
    console.log(`🌐 Bot is on ${client.guilds.cache.size} servers`);
    
    await registerCommands(client);
});

client.on('error', (error) => {
    console.error('❌ Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled rejection:', error);
});
