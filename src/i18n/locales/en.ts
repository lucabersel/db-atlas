// English: reference language. Every key must exist here; other languages fall back to it.
// Placeholders: {name}. Plural messages: objects with Intl.PluralRules categories ("other" required).

export const en = {
	// Commands and ribbon
	"ribbon.open": "Open DB Atlas diagram",
	"command.open": "Open diagram",
	"command.openTab": "Open diagram in a new tab",
	"command.openRight": "Open diagram in the right sidebar",
	"command.openLeft": "Open diagram in the left sidebar",
	"command.newTable": "New table",

	// Notices
	"notice.cannotOpenView": "DB Atlas: cannot open the view in that location.",
	"notice.noDbFolders": "DB Atlas: no DB folder configured (see the settings).",
	"notice.folderMissing": 'DB Atlas: folder "{folder}" does not exist.',
	"notice.folderAlreadyAdded": 'DB Atlas: "{folder}" is already in the list.',
	"notice.createFailed": 'DB Atlas: could not create table "{name}".',
	"notice.noteMissing": 'DB Atlas: note "{path}" not found.',
	"notice.refsUpdated": {
		one: 'DB Atlas: references to "{table}" updated in {count} note.',
		other: 'DB Atlas: references to "{table}" updated in {count} notes.',
	},
	"notice.refsFailed": {
		one: "DB Atlas: could not update the references in {count} note (see the console).",
		other: "DB Atlas: could not update the references in {count} notes (see the console).",
	},

	// New table
	"folderPicker.placeholder": "Choose the DB folder for the new table",
	"newTable.title": "New table",
	"newTable.folder": "DB folder: {folder}",
	"newTable.name": "Table name",
	"newTable.placeholder": "e.g. customers",
	"newTable.cancel": "Cancel",
	"newTable.create": "Create",
	"name.empty": "Enter a name.",
	"name.dot": 'The name cannot contain ".".',
	"name.chars": 'The name contains characters that are not allowed: \\ / : * ? " < > | # ^ [ ]',
	"name.duplicate": 'A note named "{name}" already exists in this folder.',
	"template.primaryKey": "Primary key.",

	// Settings
	"settings.folders.heading": "DB folders",
	"settings.folders.desc":
		"Each folder is a database: the notes directly inside it are the tables. Subfolders are ignored. The order of the list is the order of the folder menu in the diagram.",
	"settings.folders.search": "Search a vault folder…",
	"settings.folders.add": "Add",
	"settings.folders.empty": "No folder configured.",
	"settings.folders.drag": "Drag to reorder",
	"settings.folders.remove": "Remove",
	"settings.folders.tableCount": { one: "{count} table", other: "{count} tables" },
	"settings.folders.notFound": "not found",
	"settings.others.heading": "Other options",
	"settings.language.name": "Language",
	"settings.language.desc": "Language of the plugin interface. Command names are updated after restarting Obsidian.",
	"settings.language.auto": "Automatic (Obsidian language)",
	"settings.viewLocation.name": "Diagram location",
	"settings.viewLocation.desc": "Where the diagram opens with the default command and the ribbon icon.",
	"settings.viewLocation.tab": "Main tab",
	"settings.viewLocation.right": "Right sidebar",
	"settings.viewLocation.left": "Left sidebar",
	"settings.template.name": "New table template",
	"settings.template.desc": 'Content of the note created by the "New table" command. {{name}} is replaced by the table name.',
	"settings.template.reset": "Restore default",

	// Diagram view
	"view.folderMenu": "DB folder",
	"view.manageFolders": "Manage folders…",
	"view.zoomIn": "Zoom in",
	"view.zoomOut": "Zoom out",
	"view.fit": "Fit to view",
	"view.folderMissing": 'Folder "{folder}" does not exist in the vault.',
	"view.folderEmpty": 'Folder "{folder}" contains no notes.',
	"view.noFolders": "No DB folder configured.",
	"view.noFoldersHint": "Add in the settings the folders that represent a database.",
	"view.openSettings": "Open settings",
	"view.layingOut": "Laying out tables…",
	"diagram.noColumns": "no columns",

	// Validation issues
	"issue.invalidJson": "Invalid JSON",
	"issue.notObject": "Invalid JSON: an object is expected",
	"issue.missingDefinition": "Missing or invalid definition: a JSON string is expected",
	"issue.yamlObject": "YAML value without quotes: use a JSON string in single quotes",
	"issue.missingType": 'Missing "type" key',
	"issue.invalidRel": 'Invalid "rel" ({value}): ">" is used',
	"issue.noColumns": "No columns (no col_* property)",
	"issue.dotInName": 'The name contains ".": the table cannot be referenced',
	"issue.refMalformed": 'Malformed ref "{ref}": "table.column" is expected',
	"issue.refMissingTable": 'Broken ref: table "{table}" does not exist in this folder',
	"issue.refMissingColumn": 'Broken ref: column "{column}" does not exist in "{table}"',
} as const;
