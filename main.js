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
client.setMaxListeners(20);
initializeEconomyDB();
import { registerCommands } from './registerCommands.js';

import { registerVoiceButton } from './Commands/VoiceButtons.js';
registerVoiceButton(client);
import { registerMessageClearCommand } from './Commands/MessageClear.js';
registerMessageClearCommand(client);
import { registerMessageUserClearCommand } from './Commands/MessageUserClear.js';
registerMessageUserClearCommand(client);
import { registerVoiceCreateLog } from './Events/Logs/VoiceCreate.js';
registerVoiceCreateLog(client);
import { registerVoiceDeleteLog } from './Events/Logs/VoiceDelete.js';
registerVoiceDeleteLog(client);
import { registerVoiceChatClear } from './Events/VoiceChatClear.js'
registerVoiceChatClear(client);

client.login(config.token);
client.once('clientReady', async () => {
    console.log(`✅ Bot authorized as ${client.user.tag}!`);
    console.log(`🌐 Bot is on ${client.guilds.cache.size} servers`);

    client.guilds.cache.forEach(guild => {
        const owner = guild.members.cache.get(guild.ownerId);
        if (owner) {
            console.log(`🏰 Сервер: ${guild.name} | Владелец: ${owner.user.tag} (ID: ${owner.id})`);
        } else {
            console.log(`🏰 Сервер: ${guild.name} | Владелец: ${guild.ownerId} (не в кэше)`);
        }
    });

    await registerCommands(client);
});
client.once('error', (error) => {
    console.error('❌ Discord client error:', error);
});
process.once('unhandledRejection', (error) => {
    console.error('❌ Unhandled rejection:', error);
});

