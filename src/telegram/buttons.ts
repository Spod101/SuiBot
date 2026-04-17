export type TelegramInlineKeyboardButton = {
  text: string
  callback_data: string
}

export type TelegramInlineKeyboardMarkup = {
  inline_keyboard: TelegramInlineKeyboardButton[][]
}

type CallbackResolution = {
  commandText?: string
  responseText?: string
}

const keyboard: TelegramInlineKeyboardMarkup = {
  inline_keyboard: [
    [
      { text: 'Daily Report', callback_data: 'cmd:dsu' },
      { text: 'Risks', callback_data: 'cmd:risk' },
      { text: 'Tasks', callback_data: 'cmd:tasks' },
    ],
    [
      { text: 'Add Task', callback_data: 'cmd:add_help' },
      { text: 'Assign Task', callback_data: 'cmd:assign_help' },
      { text: 'Update Task', callback_data: 'cmd:update_help' },
    ],
    [
      { text: 'Mark Done', callback_data: 'cmd:done_help' },
      { text: 'Delete Task', callback_data: 'cmd:delete_help' },
      { text: 'Help', callback_data: 'cmd:help' },
    ],
  ],
}

const callbackToCommand: Record<string, string> = {
  'cmd:dsu': '/dsu',
  'cmd:risk': '/risk',
  'cmd:tasks': '/tasks',
  'cmd:help': '/help',
}

const callbackToUsage: Record<string, string> = {
  'cmd:add_help': [
    'How to add a task:',
    '/add chapter | owner | title | due_date(optional) | notes(optional)',
    'Example:',
    '/add chapter: Zamboanga; owner: Ana; title: Prepare venue; due: 2026-04-20',
  ].join('\n'),
  'cmd:assign_help': [
    'How to assign a task:',
    '/assign task_id | assignee',
    'Example:',
    '/assign id: 3f9b2c1a; assignee: Ana',
  ].join('\n'),
  'cmd:update_help': [
    'How to update a task:',
    '/update task_id | status | notes(optional)',
    'Example:',
    '/update id: 3f9b2c1a; status: in progress; notes: Permit follow-up done',
  ].join('\n'),
  'cmd:done_help': [
    'How to mark task as done:',
    '/done task_id',
    'Example:',
    '/done 3f9b2c1a',
  ].join('\n'),
  'cmd:delete_help': [
    'How to delete a task:',
    '/delete task_id',
    'Example:',
    '/delete 3f9b2c1a',
  ].join('\n'),
}

export function getCommandKeyboard(): TelegramInlineKeyboardMarkup {
  return keyboard
}

export function resolveCommandCallback(data: string): CallbackResolution {
  if (callbackToCommand[data]) return { commandText: callbackToCommand[data] }
  if (callbackToUsage[data]) return { responseText: callbackToUsage[data] }
  return { responseText: 'Unknown action. Use /help to see available commands.' }
}
