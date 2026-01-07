import { REST, Routes } from 'discord.js';
import config from './config.json' with { type: "json" };

const commands = [
    {
        name: 'clear',
        description: 'Delete recent messages in the channel',
        options: [
            {
                name: 'amount',
                type: 4,
                description: 'Number of messages to delete (1-100)',
                required: true,
                min_value: 1,
                max_value: 100
            }
        ]
    },
    {
        name: 'clearuser',
        description: 'Delete recent messages from a specific user',
        options: [
            {
                name: 'user',
                type: 6,
                description: 'User whose messages to delete',
                required: true
            },
            {
                name: 'amount',
                type: 4,
                description: 'Number of messages to delete (1-100)',
                required: true,
                min_value: 1,
                max_value: 100
            }
        ]
    },
];

export async function registerCommands(client) {
    const rest = new REST({ version: '10' }).setToken(config.token);

    try {
        console.log('🔍 Checking and updating slash commands...');

        const existingCommands = await rest.get(
            Routes.applicationCommands(client.user.id)
        );
        
        console.log(`📋 Found ${existingCommands.length} registered commands`);

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );

        console.log('✅ Slash commands successfully updated!');

        const commandNames = commands.map(cmd => cmd.name);
        const newCommands = commands.filter(cmd => 
            !existingCommands.some(existing => existing.name === cmd.name)
        );
        
        const removedCommands = existingCommands.filter(existing => 
            !commandNames.includes(existing.name)
        );
        
        if (newCommands.length > 0) {
            console.log(`🆕 New commands added: ${newCommands.map(cmd => cmd.name).join(', ')}`);
        }
        
        if (removedCommands.length > 0) {
            console.log(`🗑️ Commands removed: ${removedCommands.map(cmd => cmd.name).join(', ')}`);
        }
        
        if (newCommands.length === 0 && removedCommands.length === 0) {
            console.log('ℹ️ All commands are up to date, no changes required');
        }
        
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
}
