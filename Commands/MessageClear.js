import { Events } from 'discord.js';
import { sendLogEmbed } from '../Events/LogSettings.js';
import { CHANNEL_IDS } from '../server_ids.js';

export function registerMessageClearCommand(client) {
    client.on(Events.InteractionCreate, async interaction => {
        if (!interaction.isChatInputCommand()) return;
        
        if (interaction.commandName === 'clear') {
            const hasAdminRole = Array.isArray(CHANNEL_IDS.ADMIN_ROLE) 
                ? CHANNEL_IDS.ADMIN_ROLE.some(roleId => interaction.member.roles.cache.has(roleId))
                : interaction.member.roles.cache.has(CHANNEL_IDS.ADMIN_ROLE);
            
            if (!hasAdminRole) {
                return await interaction.reply({
                    content: '❌ Только администраторы могут использовать эту команду!',
                    ephemeral: true
                });
            }

            const amount = interaction.options.getInteger('amount');

            try {
                await interaction.deferReply({ ephemeral: true });

                const messages = await interaction.channel.messages.fetch({ limit: amount });
                const filteredMessages = messages.filter(msg => {
                    return Date.now() - msg.createdTimestamp < 14 * 24 * 60 * 60 * 1000;
                });

                if (filteredMessages.size === 0) {
                    return await interaction.editReply({
                        content: '❌ Не удалось удалить сообщения. Все сообщения старше 14 дней.'
                    });
                }

                await interaction.channel.bulkDelete(filteredMessages, true);
                
                // Логирование
                await sendLogEmbed(client, 
                    '🗑️ Массовое удаление сообщений',
                    `Было удалено ${filteredMessages.size} сообщений в канале`,
                    '#FF6B6B',
                    [
                        { name: 'Администратор', value: `${interaction.user} (ID: ${interaction.user.id})`, inline: true },
                        { name: 'Канал', value: `${interaction.channel}`, inline: true },
                        { name: 'Запрошено', value: `${amount} сообщений`, inline: true },
                        { name: 'Удалено', value: `${filteredMessages.size} сообщений`, inline: true }
                    ]
                );

                await interaction.editReply({
                    content: `✅ Успешно удалено ${filteredMessages.size} сообщений!`
                });

            } catch (error) {
                console.error('Ошибка при удалении сообщений:', error);
                await interaction.editReply({
                    content: '❌ Произошла ошибка при удалении сообщений!'
                });
            }
        }
    });
}
