import { Events } from 'discord.js';
import { sendLogEmbed } from '..//Events/Logs/LogSettings.js';
import { CHANNEL_IDS } from '../server_ids.js'; // Добавляем импорт

export function registerMessageUserClearCommand(client) {
    client.on(Events.InteractionCreate, async interaction => {
        if (!interaction.isChatInputCommand()) return;
        
        if (interaction.commandName === 'clearuser') {
            // Проверяем, есть ли у пользователя роль администратора
            const hasAdminRole = Array.isArray(CHANNEL_IDS.ADMIN_ROLE) 
                ? CHANNEL_IDS.ADMIN_ROLE.some(roleId => interaction.member.roles.cache.has(roleId))
                : interaction.member.roles.cache.has(CHANNEL_IDS.ADMIN_ROLE);
            
            if (!hasAdminRole) {
                return await interaction.reply({
                    content: '❌ Только администраторы могут использовать эту команду!',
                    ephemeral: true
                });
            }

            const user = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');

            try {
                await interaction.deferReply({ ephemeral: true });
                const messages = await interaction.channel.messages.fetch({ limit: 100 });
                const userMessages = messages.filter(msg => {
                    return msg.author.id === user.id && 
                           Date.now() - msg.createdTimestamp < 14 * 24 * 60 * 60 * 1000;
                }).first(amount);

                if (userMessages.length === 0) {
                    return await interaction.editReply({
                        content: `❌ Не найдено сообщений от пользователя ${user} для удаления.`
                    });
                }

                await interaction.channel.bulkDelete(userMessages, true);

                await sendLogEmbed(client,
                    '🗑️ Удаление сообщений пользователя',
                    `Были удалены сообщения пользователя в канале`,
                    '#FFA500',
                    [
                        { name: 'Администратор', value: `${interaction.user} (ID: ${interaction.user.id})`, inline: true },
                        { name: 'Пользователь', value: `${user} (ID: ${user.id})`, inline: true },
                        { name: 'Канал', value: `${interaction.channel}`, inline: true },
                        { name: 'Удалено сообщений', value: `${userMessages.length}`, inline: true }
                    ]
                );

                await interaction.editReply({
                    content: `✅ Успешно удалено ${userMessages.length} сообщений от пользователя ${user}!`
                });

            } catch (error) {
                console.error('Ошибка при удалении сообщений пользователя:', error);
                await interaction.editReply({
                    content: '❌ Произошла ошибка при удалении сообщений!'
                });
            }
        }
    });
}
